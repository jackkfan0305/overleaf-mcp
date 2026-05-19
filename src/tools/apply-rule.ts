import { z } from 'zod'
import type { EnvironmentName } from '../types.js'
import { LatexPatcher } from '../latex/patcher.js'
import type { WorkspaceManager } from '../git/workspace.js'
import type { SessionStore } from '../session.js'

type RuleName =
  | 'ensure_trailing_period'
  | 'remove_trailing_period'
  | 'title_case'
  | 'sentence_case'
  | 'uppercase'
  | 'lowercase'

const RULES: Record<RuleName, (content: string) => string> = {
  ensure_trailing_period: (s) => s.match(/[.!?]$/) ? s : s + '.',
  remove_trailing_period: (s) => s.replace(/\.$/, ''),
  title_case: (s) =>
    s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  sentence_case: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  uppercase: (s) => s.toUpperCase(),
  lowercase: (s) => s.toLowerCase(),
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

    const envPattern = new RegExp(`\\\\${parsed.environment}\\{`, 'g')
    const originalMatches = (currentContent.match(envPattern) ?? []).length

    matchesChanged += originalMatches
    filesChanged++

    session.merge(projectName, [{
      ...patch,
      original: diskContent,
    }], summary)
  }

  return { filesChanged, matchesChanged, summary }
}
