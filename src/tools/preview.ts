import type { SessionStore } from '../session.js'

export interface PreviewResult {
  hasPendingChanges: boolean
  summary: string
  diff: string
  filesAffected: string[]
}

export function handlePreviewChanges(
  session: SessionStore,
  projectName: string
): PreviewResult {
  const pending = session.get(projectName)
  if (!pending || pending.patches.length === 0) {
    return { hasPendingChanges: false, summary: 'No pending changes.', diff: '', filesAffected: [] }
  }
  return {
    hasPendingChanges: true,
    summary: pending.summary,
    diff: pending.patches.map(p => p.diff).join('\n\n'),
    filesAffected: pending.patches.map(p => p.file),
  }
}
