import { z } from 'zod'
import type { EnvironmentName } from '../types.js'
import { LatexPatcher } from '../latex/patcher.js'
import { LatexParser } from '../latex/parser.js'
import type { WorkspaceManager } from '../git/workspace.js'
import type { SessionStore } from '../session.js'

type RuleName =
  | 'ensure_trailing_period'
  | 'remove_trailing_period'
  | 'title_case'
  | 'sentence_case'
  | 'uppercase'
  | 'lowercase'

/**
 * Split content into LaTeX command spans and plain text spans.
 * Commands (e.g. \LaTeX{}, \textbf{...}) are preserved verbatim;
 * only plain-text segments are passed to the case transform.
 */
function transformPreservingCommands(
  content: string,
  textTransform: (text: string) => string
): string {
  // Match backslash-commands with optional braced argument, or $..$ math
  const commandPattern = /\\[a-zA-Z]+\*?(?:\{[^}]*\})?|\$[^$]+\$/g
  const parts: string[] = []
  let lastIndex = 0
  for (const match of content.matchAll(commandPattern)) {
    if (match.index > lastIndex) {
      parts.push(textTransform(content.slice(lastIndex, match.index)))
    }
    parts.push(match[0]) // preserve command verbatim
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(textTransform(content.slice(lastIndex)))
  }
  return parts.join('')
}

const RULES: Record<RuleName, (content: string) => string> = {
  ensure_trailing_period: (s) => s.match(/[.!?]$/) ? s : s + '.',
  remove_trailing_period: (s) => s.replace(/\.$/, ''),
  title_case: (s) => transformPreservingCommands(s, (text) =>
    text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  ),
  sentence_case: (s) => transformPreservingCommands(s, (text) =>
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
  ),
  uppercase: (s) => transformPreservingCommands(s, (text) => text.toUpperCase()),
  lowercase: (s) => transformPreservingCommands(s, (text) => text.toLowerCase()),
}

const RULE_NAMES = Object.keys(RULES) as [RuleName, ...RuleName[]]
const VALID_ENVIRONMENTS = [
  'caption', 'section', 'subsection', 'subsubsection', 'label',
] as const

export const ApplyRuleInput = z.object({
  environment: z.enum(VALID_ENVIRONMENTS),
  rule: z.enum(RULE_NAMES),
  files: z.array(z.string()).optional(),
})
export type ApplyRuleInput = z.infer<typeof ApplyRuleInput>

export interface ApplyRuleResult {
  filesChanged: number
  matchesChanged: number
  summary: string
}

export async function handleApplyRule(
  workspace: WorkspaceManager,
  session: SessionStore,
  projectName: string,
  input: { environment: EnvironmentName; rule: RuleName; files?: string[] }
): Promise<ApplyRuleResult> {
  const parsed = ApplyRuleInput.parse(input)
  const patcher = new LatexPatcher()
  const transform = RULES[parsed.rule]
  const files = parsed.files ?? workspace.listTexFiles()
  const summary = `Apply "${parsed.rule}" to \\${parsed.environment}{} blocks`

  let filesChanged = 0
  let matchesChanged = 0

  for (const file of files) {
    const diskContent = workspace.readFile(file)
    const currentContent = session.getFileContent(projectName, file, diskContent)
    const patch = patcher.applyTransform(currentContent, file, parsed.environment, transform)
    if (patch.diff === '') continue

    const parser = new LatexParser()
    const envs = parser.extractEnvironments(currentContent, file, parsed.environment)
    const changedCount = envs.filter(env => transform(env.content) !== env.content).length

    matchesChanged += changedCount
    filesChanged++

    session.merge(projectName, [{
      ...patch,
      original: diskContent,
    }], summary)
  }

  return { filesChanged, matchesChanged, summary }
}
