import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleScanPattern } from '../../src/tools/scan.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('handleScanPattern', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-tool-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\section{Intro}\n\\caption{A result}\n\\caption{Another result.}'
    )
    ws = new WorkspaceManager(tmpDir)
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('returns matches for a valid environment', async () => {
    const result = await handleScanPattern(ws, { environment: 'caption' })
    expect(result.matches).toHaveLength(2)
    expect(result.matches[0].content).toBe('A result')
  })

  it('throws on unsupported environment', async () => {
    await expect(
      handleScanPattern(ws, { environment: 'invalid' as any })
    ).rejects.toThrow()
  })
})
