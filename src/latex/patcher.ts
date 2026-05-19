import { createPatch } from 'diff'
import { LatexParser } from './parser.js'
import type { EnvironmentName, FilePatch } from '../types.js'

export class LatexPatcher {
  private readonly parser = new LatexParser()

  applyTransform(
    original: string,
    file: string,
    type: EnvironmentName,
    transform: (content: string) => string
  ): FilePatch {
    const matches = this.parser.extractEnvironments(original, file, type)

    // Apply in reverse order so earlier offsets remain valid
    let patched = original
    for (const env of [...matches].reverse()) {
      const transformed = transform(env.content)
      if (transformed === env.content) continue
      // Use replacer function to avoid $-sequence interpretation ($$, $&, $', $`)
      // and indexOf+slice to handle content appearing more than once in raw
      const idx = env.match.raw.indexOf(env.content)
      const newRaw = idx === -1
        ? env.match.raw.replace(env.content, () => transformed)
        : env.match.raw.slice(0, idx) + transformed + env.match.raw.slice(idx + env.content.length)
      patched =
        patched.slice(0, env.match.offset) +
        newRaw +
        patched.slice(env.match.offset + env.match.raw.length)
    }

    const diff =
      patched === original
        ? ''
        : createPatch(file, original, patched, 'original', 'patched')

    return { file, original, patched, diff }
  }
}
