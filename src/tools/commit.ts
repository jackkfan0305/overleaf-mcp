import { z } from 'zod'
import type { SessionStore } from '../session.js'
import type { WorkspaceManager } from '../git/workspace.js'
import type { GitClient } from '../git/client.js'

export const CommitInput = z.object({
  message: z.string().min(1, 'Commit message required'),
  projectName: z.string().default('default'),
})
export type CommitInput = z.infer<typeof CommitInput>

export interface CommitResult {
  success: boolean
  filesCommitted: string[]
  message: string
}

export async function handleCommitChanges(
  session: SessionStore,
  workspace: WorkspaceManager,
  git: GitClient,
  input: CommitInput
): Promise<CommitResult> {
  const parsed = CommitInput.parse(input)
  const pending = session.get(parsed.projectName)

  if (!pending || pending.patches.length === 0) {
    return { success: false, filesCommitted: [], message: 'No pending changes to commit.' }
  }

  for (const patch of pending.patches) {
    workspace.writeFile(patch.file, patch.patched)
  }

  const files = pending.patches.map(p => p.file)
  await git.commitAndPush(files, parsed.message)
  session.clear(parsed.projectName)

  return {
    success: true,
    filesCommitted: files,
    message: `Committed ${files.length} file(s) and pushed to Overleaf: "${parsed.message}"`,
  }
}
