import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleCommitChanges } from '../../src/tools/commit.js'
import { WorkspaceManager } from '../../src/git/workspace.js'
import { SessionStore } from '../../src/session.js'
import type { FilePatch } from '../../src/types.js'

function makePatch(file: string, original: string, patched: string): FilePatch {
  return {
    file,
    original,
    patched,
    diff: `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${original}\n+${patched}`,
  }
}

describe('handleCommitChanges', () => {
  let tmpDir: string
  let ws: WorkspaceManager
  let store: SessionStore
  let mockGit: { commitAndPush: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-test-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\caption{Original}')
    ws = new WorkspaceManager(tmpDir)
    store = new SessionStore()
    mockGit = { commitAndPush: vi.fn().mockResolvedValue(undefined) }
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('writes patched content to disk and calls git commit+push', async () => {
    store.merge('default', [
      makePatch('main.tex', '\\caption{Original}', '\\caption{Original.}'),
    ], 'add period')

    const result = await handleCommitChanges(
      store, ws, mockGit as any,
      { message: 'style: add trailing periods', projectName: 'default' }
    )

    expect(result.success).toBe(true)
    expect(result.filesCommitted).toEqual(['main.tex'])
    expect(result.message).toContain('1 file(s)')

    // Disk should now have the patched content
    const disk = fs.readFileSync(path.join(tmpDir, 'main.tex'), 'utf8')
    expect(disk).toBe('\\caption{Original.}')

    // Git should have been called with the right args
    expect(mockGit.commitAndPush).toHaveBeenCalledWith(
      ['main.tex'],
      'style: add trailing periods'
    )

    // Session should be cleared
    expect(store.get('default')).toBeNull()
  })

  it('commits multiple files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ch2.tex'), '\\caption{Second}')
    store.merge('default', [
      makePatch('main.tex', '\\caption{Original}', '\\caption{Original.}'),
      makePatch('ch2.tex', '\\caption{Second}', '\\caption{Second.}'),
    ], 'add periods')

    const result = await handleCommitChanges(
      store, ws, mockGit as any,
      { message: 'batch fix', projectName: 'default' }
    )

    expect(result.success).toBe(true)
    expect(result.filesCommitted).toHaveLength(2)
    expect(mockGit.commitAndPush).toHaveBeenCalledOnce()
  })

  it('returns failure when no pending changes exist', async () => {
    const result = await handleCommitChanges(
      store, ws, mockGit as any,
      { message: 'nothing to do', projectName: 'default' }
    )

    expect(result.success).toBe(false)
    expect(result.filesCommitted).toHaveLength(0)
    expect(mockGit.commitAndPush).not.toHaveBeenCalled()
  })

  it('rejects empty commit message', async () => {
    store.merge('default', [
      makePatch('main.tex', 'a', 'b'),
    ], 'rule')

    await expect(
      handleCommitChanges(store, ws, mockGit as any, { message: '', projectName: 'default' })
    ).rejects.toThrow()
  })

  it('does not clear session if git push fails', async () => {
    store.merge('default', [
      makePatch('main.tex', '\\caption{Original}', '\\caption{Original.}'),
    ], 'add period')

    mockGit.commitAndPush.mockRejectedValue(new Error('push failed'))

    await expect(
      handleCommitChanges(store, ws, mockGit as any, {
        message: 'will fail', projectName: 'default',
      })
    ).rejects.toThrow('push failed')

    // Session should still have the pending changes
    expect(store.get('default')).not.toBeNull()

    // Disk should be restored to original content
    const disk = fs.readFileSync(path.join(tmpDir, 'main.tex'), 'utf8')
    expect(disk).toBe('\\caption{Original}')
  })
})
