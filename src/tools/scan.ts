import { z } from 'zod'
import type { EnvironmentName } from '../types.js'
import { LatexScanner } from '../latex/scanner.js'
import type { WorkspaceManager } from '../git/workspace.js'

const VALID_ENVIRONMENTS = [
  'caption', 'section', 'subsection', 'subsubsection',
  'label', 'ref', 'cite', 'equation', 'align',
  'figure', 'table', 'math-inline', 'math-display', 'newcommand',
] as const

export const ScanPatternInput = z.object({
  environment: z.enum(VALID_ENVIRONMENTS),
  files: z.array(z.string()).optional(),
})
export type ScanPatternInput = z.infer<typeof ScanPatternInput>

export interface ScanPatternResult {
  matches: Array<{ file: string; line: number; raw: string; content: string }>
  total: number
}

export async function handleScanPattern(
  workspace: WorkspaceManager,
  input: { environment: EnvironmentName; files?: string[] }
): Promise<ScanPatternResult> {
  const parsed = ScanPatternInput.parse(input)
  const scanner = new LatexScanner(workspace)
  const matches = scanner.findAll(parsed.environment, { files: parsed.files })
  return {
    matches: matches.map(m => ({
      file: m.match.file,
      line: m.match.line,
      raw: m.match.raw,
      content: m.content,
    })),
    total: matches.length,
  }
}
