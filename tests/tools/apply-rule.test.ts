import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleApplyRule } from '../../src/tools/apply-rule.js'
import { WorkspaceManager } from '../../src/git/workspace.js'
import { SessionStore } from '../../src/session.js'

describe('handleApplyRule', () => {
  let tmpDir: string
  let ws: WorkspaceManager
  let store: SessionStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-rule-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\caption{A result}\n\\caption{Another result}\n'
    )
    ws = new WorkspaceManager(tmpDir)
    store = new SessionStore()
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('adds period to captions and stores in session without touching disk', async () => {
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'ensure_trailing_period',
    })
    expect(result.filesChanged).toBe(1)
    expect(result.matchesChanged).toBe(2)

    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\caption{A result.}')
    expect(pending?.patches[0].patched).toContain('\\caption{Another result.}')

    // Disk must NOT be modified
    const disk = fs.readFileSync(path.join(tmpDir, 'main.tex'), 'utf8')
    expect(disk).toContain('\\caption{A result}\n')
  })

  it('applies title_case rule to sections', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\section{introduction}\n\\section{related work}\n'
    )
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'section',
      rule: 'title_case',
    })
    expect(result.matchesChanged).toBe(2)
    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\section{Introduction}')
    expect(pending?.patches[0].patched).toContain('\\section{Related Work}')
  })

  it('applies sentence_case rule', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\section{ALL CAPS TITLE}\n'
    )
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'section',
      rule: 'sentence_case',
    })
    expect(result.matchesChanged).toBe(1)
    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\section{All caps title}')
  })

  it('applies remove_trailing_period rule', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\caption{Has a period.}\n\\caption{No period}\n'
    )
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'remove_trailing_period',
    })
    expect(result.matchesChanged).toBeGreaterThanOrEqual(1)
    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\caption{Has a period}')
  })

  it('skips files with no changes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\caption{Already has period.}\n'
    )
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'ensure_trailing_period',
    })
    expect(result.filesChanged).toBe(0)
    expect(result.matchesChanged).toBe(0)
    expect(store.get('default')).toBeNull()
  })

  it('scopes to specific files when provided', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.tex'), '\\caption{First}\n')
    fs.writeFileSync(path.join(tmpDir, 'b.tex'), '\\caption{Second}\n')
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'ensure_trailing_period',
      files: ['a.tex'],
    })
    expect(result.filesChanged).toBe(1)
    const pending = store.get('default')
    expect(pending?.patches).toHaveLength(1)
    expect(pending?.patches[0].file).toBe('a.tex')
  })

  it('throws on invalid rule name', async () => {
    await expect(
      handleApplyRule(ws, store, 'default', {
        environment: 'caption',
        rule: 'nonexistent' as any,
      })
    ).rejects.toThrow()
  })

  it('throws on invalid environment', async () => {
    await expect(
      handleApplyRule(ws, store, 'default', {
        environment: 'invalid' as any,
        rule: 'ensure_trailing_period',
      })
    ).rejects.toThrow()
  })

  it('reads from pending content when session already has patches for a file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\caption{A result}\n\\section{intro}\n'
    )

    await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'ensure_trailing_period',
    })
    await handleApplyRule(ws, store, 'default', {
      environment: 'section',
      rule: 'title_case',
    })

    const pending = store.get('default')
    // Both transforms should be present in the same file patch
    expect(pending?.patches[0].patched).toContain('\\caption{A result.}')
    expect(pending?.patches[0].patched).toContain('\\section{Intro}')
  })
})
