export type BreakWavesEntryMode = 'scan' | 'test'

// The external card route hands this one-shot router-state receipt to the trail page. It only
// unlocks entry for the same session, and the page consumes it so a reload cannot reuse old state.
export function breakWavesScanReceipt(sessionId: string) {
  return { breakWavesScanReceipt: { sessionId } }
}

export function hasBreakWavesScanReceipt(state: unknown, sessionId: string) {
  if (!state || typeof state !== 'object') return false
  const receipt = (state as { breakWavesScanReceipt?: { sessionId?: string } }).breakWavesScanReceipt
  return receipt?.sessionId === sessionId
}
