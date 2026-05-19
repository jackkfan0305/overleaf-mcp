import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { LatexParser } from '../../src/latex/parser.js'

const FIXTURES = path.join(import.meta.dirname, '../fixtures')
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')

describe('LatexParser', () => {
  describe('extractEnvironments', () => {
    it('extracts captions', () => {
      const envs = new LatexParser().extractEnvironments(fixture('simple.tex'), 'simple.tex', 'caption')
      expect(envs).toHaveLength(1)
      expect(envs[0].content).toBe('A figure showing results')
      expect(envs[0].match.line).toBeGreaterThan(0)
    })

    it('extracts labels', () => {
      const envs = new LatexParser().extractEnvironments(fixture('simple.tex'), 'simple.tex', 'label')
      expect(envs).toHaveLength(1)
      expect(envs[0].content).toBe('fig:results')
    })

    it('extracts sections', () => {
      const envs = new LatexParser().extractEnvironments(fixture('simple.tex'), 'simple.tex', 'section')
      expect(envs).toHaveLength(1)
      expect(envs[0].content).toBe('Introduction')
    })

    it('extracts inline math', () => {
      const envs = new LatexParser().extractEnvironments(fixture('simple.tex'), 'simple.tex', 'math-inline')
      expect(envs.length).toBeGreaterThanOrEqual(1)
      expect(envs[0].content).toBe('\\alpha')
    })

    it('extracts refs and cites from multi.tex', () => {
      const parser = new LatexParser()
      const refs = parser.extractEnvironments(fixture('multi.tex'), 'multi.tex', 'ref')
      expect(refs.map(r => r.content)).toContain('fig:results')
      const cites = parser.extractEnvironments(fixture('multi.tex'), 'multi.tex', 'cite')
      expect(cites.map(c => c.content)).toContain('smith2020')
    })

    it('extracts command content with nested braces', () => {
      const envs = new LatexParser().extractEnvironments(
        '\\caption{Accuracy of \\textbf{Model A}}',
        'main.tex',
        'caption'
      )
      expect(envs).toHaveLength(1)
      expect(envs[0].content).toBe('Accuracy of \\textbf{Model A}')
      expect(envs[0].match.raw).toBe('\\caption{Accuracy of \\textbf{Model A}}')
    })

    it('extracts multiline captions with optional arguments', () => {
      const envs = new LatexParser().extractEnvironments(
        '\\caption[Short]{Long caption\nwith detail}',
        'main.tex',
        'caption'
      )
      expect(envs).toHaveLength(1)
      expect(envs[0].content).toBe('Long caption\nwith detail')
    })

    it('extracts cite variants as citations', () => {
      const envs = new LatexParser().extractEnvironments(
        'See \\citep{smith2020} and \\citet{jones2021}.',
        'main.tex',
        'cite'
      )
      expect(envs.map(env => env.content)).toEqual(['smith2020', 'jones2021'])
    })

    it('ignores commented commands', () => {
      const envs = new LatexParser().extractEnvironments(
        '% \\caption{Ignore me}\n\\caption{Use me}',
        'main.tex',
        'caption'
      )
      expect(envs.map(env => env.content)).toEqual(['Use me'])
    })

    it('extracts starred command variants', () => {
      const envs = new LatexParser().extractEnvironments(
        '\\section*{Acknowledgments}',
        'main.tex',
        'section'
      )
      expect(envs.map(env => env.content)).toEqual(['Acknowledgments'])
    })
  })

  describe('lineAt', () => {
    it('returns correct 1-based line for an offset', () => {
      const p = new LatexParser()
      const content = 'line1\nline2\nline3'
      expect(p.lineAt(content, 0)).toBe(1)
      expect(p.lineAt(content, 6)).toBe(2)
      expect(p.lineAt(content, 12)).toBe(3)
    })
  })
})
