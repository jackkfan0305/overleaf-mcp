import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LatexScanner } from '../../src/latex/scanner.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('LatexScanner', () => {
  let tmpDir: string
  let scanner: LatexScanner

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), [
      '\\section{Intro}',
      'See \\ref{fig:a} and \\ref{fig:b}',
      '\\begin{figure}',
      '  \\caption{A figure}',
      '  \\label{fig:a}',
      '\\end{figure}',
    ].join('\n'))
    fs.writeFileSync(path.join(tmpDir, 'chapter2.tex'), [
      '\\section{Methods}',
      '\\begin{figure}',
      '  \\caption{Another figure}',
      '  \\label{fig:b}',
      '\\end{figure}',
    ].join('\n'))
    scanner = new LatexScanner(new WorkspaceManager(tmpDir))
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('finds all captions across files', () => {
    const matches = scanner.findAll('caption')
    expect(matches).toHaveLength(2)
    expect(matches.map(m => m.content)).toContain('A figure')
    expect(matches.map(m => m.content)).toContain('Another figure')
  })

  it('finds all refs across files', () => {
    expect(scanner.findAll('ref')).toHaveLength(2)
  })

  it('filters to a specific file', () => {
    const matches = scanner.findAll('caption', { files: ['main.tex'] })
    expect(matches).toHaveLength(1)
    expect(matches[0].match.file).toBe('main.tex')
  })
})
