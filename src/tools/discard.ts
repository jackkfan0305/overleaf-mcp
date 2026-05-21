import type { SessionStore } from '../session.js'

export interface DiscardResult {
  message: string
  filesDiscarded: number
}

export function handleDiscardChanges(
  session: SessionStore,
  projectName: string
): DiscardResult {
  const pending = session.get(projectName)
  const count = pending?.patches.length ?? 0
  session.clear(projectName)
  return {
    message: count > 0
      ? `Discarded ${count} pending change(s). No files were written.`
      : 'No pending changes to discard.',
    filesDiscarded: count,
  }
}
