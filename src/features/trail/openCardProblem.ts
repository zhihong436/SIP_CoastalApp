import { supabase } from '../../lib/supabase'
import { problemForCard } from './problems'

// The name in a card link such as https://any.host/scan/storm-waves, or null when the text is not a link to a known
// problem. Any host is accepted, so cards printed for the preview and for the real site both work.
export function cardLinkFromText(text: string) {
  const name = cardNameFromText(text)
  return name && problemForCard(name) ? name : null
}

// The hunt card is deliberately separate from the legacy problem cards. Only the exact canonical
// Break the waves path can open the new stop; an unknown or future QR is not a progression key.
export const breakWavesCardName = 'break-the-waves'

export function isBreakWavesCard(text: string) {
  return cardNameFromText(text) === breakWavesCardName
}

function cardNameFromText(text: string) {
  let path: string
  try {
    path = new URL(text).pathname
  } catch {
    return null
  }
  return /^\/scan\/([^/]+)\/?$/.exec(path)?.[1] ?? null
}

// Opens the problem a card link names for the pair, making the caller its Investigator. An unknown problem is skipped
// and a finished one is refused by the database, so both leave the pair on the board. Returns false when the request
// failed. Shared by the card link page and the in-app scanner so the two cannot drift.
export async function openCardProblem(sessionId: string, cardLink: string) {
  const stop = problemForCard(cardLink)?.stop
  if (stop === undefined) return true
  const { error } = await supabase.rpc('open_stop', { p_session_id: sessionId, p_stop: stop })
  return !error
}
