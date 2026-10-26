-- Profiles for the pre-created test accounts, so testers can skip profile setup.
-- Administrative script: run it by hand against the shared project, never from the app.
-- The accounts themselves are created in the Supabase dashboard. Names and bios are made up.

insert into public.profiles (user_id, name, age, gender, bio)
values
  ('45a7d5f7-6403-4517-bd10-4c40478cf8bb', 'Test One', 24, 'Female', 'Test profile one. Enjoys sea breezes and puzzles that need two people.'),
  ('76cfd120-9c87-441a-a24c-953d4d7bb4e9', 'Test Two', 26, 'Male', 'Test profile two. Enjoys long walks by the water and trying new food.'),
  ('dd0b76d8-3337-4c01-95ce-69ddf35dc2b8', 'Test Three', 25, 'Non-binary', 'Test profile three. Enjoys photography and quiet mornings at the park.')
on conflict (user_id) do update
  set name = excluded.name, age = excluded.age, gender = excluded.gender, bio = excluded.bio;
