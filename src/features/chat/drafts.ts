// Unsent message drafts survive in-app navigation but not a reload.
// Sign-out clears them so the next account never sees them.
const drafts = new Map<string, string>()

export function getDraft(matchId: string) {
  return drafts.get(matchId) ?? ''
}

export function setDraft(matchId: string, text: string) {
  if (text) drafts.set(matchId, text)
  else drafts.delete(matchId)
}

export function clearDrafts() {
  drafts.clear()
}
