-- Messages between the two members of a match, and the conversation list the Chats screen reads.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  -- Chosen by the sender's phone, so a retried send cannot create a second message.
  client_message_id uuid not null,
  body text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (sender_id, client_message_id)
);

create index messages_match_created_idx on public.messages (match_id, created_at, id);

alter table public.messages enable row level security;

-- sender_id is filled from the session and cannot be supplied. Messages cannot be edited or deleted.
grant select on public.messages to authenticated;
grant insert (match_id, client_message_id, body) on public.messages to authenticated;

create policy "Members read their match messages"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and auth.uid() in (m.participant_a, m.participant_b)
  ));

create policy "Members send their own messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and auth.uid() in (m.participant_a, m.participant_b)
    )
  );

-- Every match with the partner's name and the latest message, newest activity first.
-- Runs with the caller's rights, so row-level security still limits it to their own matches.
create function public.list_conversations()
returns table (
  match_id uuid,
  partner_id uuid,
  partner_name text,
  matched_at timestamptz,
  last_body text,
  last_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select m.id, p.user_id, p.name, m.created_at, latest.body, latest.created_at
  from public.matches m
  join public.profiles p
    on p.user_id = case when m.participant_a = auth.uid() then m.participant_b else m.participant_a end
  left join lateral (
    select x.body, x.created_at
    from public.messages x
    where x.match_id = m.id
    order by x.created_at desc, x.id desc
    limit 1
  ) latest on true
  where auth.uid() in (m.participant_a, m.participant_b)
  order by coalesce(latest.created_at, m.created_at) desc;
$$;

revoke execute on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;

-- Realtime only announces rows the listening user is allowed to read.
alter publication supabase_realtime add table public.matches, public.messages;
