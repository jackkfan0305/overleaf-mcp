import { describe, it, expect } from 'vitest'
import { LatexPatcher } from '../../src/latex/patcher.js'

describe('LatexPatcher', () => {
  const patcher = new LatexPatcher()

  it('applies a transform to all caption matches', () => {
    const original = [
      '\\begin{figure}',
      '  \\caption{A figure showing results}',
      '\\end{figure}',
      '\\begin{figure}',
      '  \\caption{Another result}',
      '\\end{figure}',
    ].join('\n')

    const patch = patcher.applyTransform(
      original, 'main.tex', 'caption',
      (content) => content.endsWith('.') ? content : content + '.'
    )

    expect(patch.patched).toContain('\\caption{A figure showing results.}')
    expect(patch.patched).toContain('\\caption{Another result.}')
    expect(patch.diff).toContain('---')
    expect(patch.diff).toContain('+++')
  })

  it('returns no diff when nothing changes', () => {
    const original = '\\caption{Already ends with a period.}'
    const patch = patcher.applyTransform(
      original, 'main.tex', 'caption',
      (content) => content.endsWith('.') ? content : content + '.'
    )
    expect(patch.original).toBe(patch.patched)
    expect(patch.diff).toBe('')
  })

  it('preserves $$ display math in transformed content', () => {
    const original = '\\caption{Result where $$x = 1$$}'
    const patch = patcher.applyTransform(
      original, 'main.tex', 'caption',
      (content) => content.endsWith('.') ? content : content + '.'
    )
    expect(patch.patched).toBe('\\caption{Result where $$x = 1$$.}')
  })

  it('applies title_case transform to sections', () => {
    const original = '\\section{introduction}\n\\section{methods}'
    const patch = patcher.applyTransform(
      original, 'main.tex', 'section',
      (content) => content.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    )
    expect(patch.patched).toContain('\\section{Introduction}')
    expect(patch.patched).toContain('\\section{Methods}')
  })
})
