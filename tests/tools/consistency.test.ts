import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleConsistencyReport } from '../../src/tools/consistency.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('handleConsistencyReport', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consistency-'))
    ws = new WorkspaceManager(tmpDir)
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  describe('labels check', () => {
    it('flags a ref with no matching label', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'),
        '\\ref{fig:missing}\n\\label{fig:exists}'
      )
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      const errors = report.issues.filter(i => i.type === 'labels' && i.severity === 'error')
      expect(errors.some(e => e.evidence === 'fig:missing')).toBe(true)
    })

    it('flags a label with no matching ref', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\label{fig:orphaned}')
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      const warnings = report.issues.filter(i => i.type === 'labels' && i.severity === 'warning')
      expect(warnings.some(w => w.evidence === 'fig:orphaned')).toBe(true)
    })

    it('passes when all refs and labels are matched', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\ref{fig:a}\n\\label{fig:a}')
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      expect(report.issues.filter(i => i.type === 'labels')).toHaveLength(0)
    })

    it('works across multiple files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'ch1.tex'), '\\label{fig:cross}')
      fs.writeFileSync(path.join(tmpDir, 'ch2.tex'), '\\ref{fig:cross}')
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      expect(report.issues.filter(i => i.type === 'labels')).toHaveLength(0)
    })

    it('detects orphans across multiple files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'ch1.tex'), '\\ref{tab:missing}')
      fs.writeFileSync(path.join(tmpDir, 'ch2.tex'), '\\label{tab:unused}')
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      const errors = report.issues.filter(i => i.severity === 'error')
      const warnings = report.issues.filter(i => i.severity === 'warning')
      expect(errors.some(e => e.evidence === 'tab:missing')).toBe(true)
      expect(warnings.some(w => w.evidence === 'tab:unused')).toBe(true)
    })
  })

  describe('notation check', () => {
    it('flags duplicate newcommand definitions', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'),
        '\\newcommand{\\myvar}{x}\n\\newcommand{\\myvar}{y}'
      )
      const report = await handleConsistencyReport(ws, { checks: ['notation'] })
      const issues = report.issues.filter(i => i.type === 'notation')
      expect(issues.length).toBeGreaterThan(0)
      expect(issues[0].evidence).toContain('\\myvar')
    })

    it('passes when all newcommands are unique', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'),
        '\\newcommand{\\alpha}{a}\n\\newcommand{\\beta}{b}'
      )
      const report = await handleConsistencyReport(ws, { checks: ['notation'] })
      expect(report.issues.filter(i => i.type === 'notation')).toHaveLength(0)
    })

    it('detects duplicates across files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'defs.tex'), '\\newcommand{\\foo}{bar}')
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\newcommand{\\foo}{baz}')
      const report = await handleConsistencyReport(ws, { checks: ['notation'] })
      expect(report.issues.filter(i => i.type === 'notation').length).toBeGreaterThan(0)
    })
  })

  describe('summary', () => {
    it('includes error and warning counts', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'),
        '\\ref{fig:missing}\n\\label{fig:orphaned}'
      )
      const report = await handleConsistencyReport(ws, { checks: ['labels'] })
      expect(report.summary).toContain('1 error(s)')
      expect(report.summary).toContain('1 warning(s)')
    })

    it('defaults to labels and notation checks', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\label{fig:a}\n\\ref{fig:a}')
      const report = await handleConsistencyReport(ws, {})
      expect(report.checks).toContain('labels')
      expect(report.checks).toContain('notation')
    })
  })

  describe('unsupported checks', () => {
    it('returns not-implemented info for acronyms check', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), 'some text')
      const report = await handleConsistencyReport(ws, { checks: ['acronyms'] })
      const info = report.issues.filter(i => i.severity === 'info')
      expect(info.some(i => i.message.includes('not yet implemented'))).toBe(true)
    })

    it('returns not-implemented info for citations check', async () => {
      fs.writeFileSync(path.join(tmpDir, 'main.tex'), 'some text')
      const report = await handleConsistencyReport(ws, { checks: ['citations'] })
      const info = report.issues.filter(i => i.severity === 'info')
      expect(info.some(i => i.message.includes('not yet implemented'))).toBe(true)
    })
  })
})
