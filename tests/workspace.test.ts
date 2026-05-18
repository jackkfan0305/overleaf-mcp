import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceManager } from '../src/git/workspace.js'

describe('WorkspaceManager', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overleaf-test-'))
    ws = new WorkspaceManager(tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\section{Intro}\nHello world.')
    fs.writeFileSync(path.join(tmpDir, 'appendix.tex'), '\\section{App}\nExtra.')
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not a tex file')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('lists only .tex files', () => {
    const files = ws.listTexFiles()
    expect(files).toHaveLength(2)
    expect(files.every(f => f.endsWith('.tex'))).toBe(true)
  })

  it('reads file content', () => {
    const content = ws.readFile('main.tex')
    expect(content).toContain('\\section{Intro}')
  })

  it('writes file content', () => {
    ws.writeFile('main.tex', '\\section{Intro}\nHello updated.')
    expect(ws.readFile('main.tex')).toBe('\\section{Intro}\nHello updated.')
  })

  it('throws on path traversal attempt', () => {
    expect(() => ws.readFile('../etc/passwd')).toThrow('Path traversal')
  })

  it('resolves absolute path safely', () => {
    const resolved = ws.resolvePath('main.tex')
    expect(resolved.startsWith(tmpDir)).toBe(true)
  })
})
