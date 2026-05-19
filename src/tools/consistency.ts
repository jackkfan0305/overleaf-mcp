import { z } from 'zod'
import type { ConsistencyCheckType, ConsistencyIssue, ConsistencyReport } from '../types.js'
import { LatexScanner } from '../latex/scanner.js'
import type { WorkspaceManager } from '../git/workspace.js'

export const ConsistencyReportInput = z.object({
  checks: z
    .array(z.enum(['labels', 'acronyms', 'notation', 'citations']))
    .default(['labels', 'notation']),
  projectName: z.string().default('default'),
})
export type ConsistencyReportInput = z.infer<typeof ConsistencyReportInput>

function checkLabels(scanner: LatexScanner): ConsistencyIssue[] {
  const labels = scanner.findAll('label')
  const refs = scanner.findAll('ref')
  const labelSet = new Set(labels.map(l => l.content))
  const refSet = new Set(refs.map(r => r.content))
  const issues: ConsistencyIssue[] = []

  for (const ref of refs) {
    if (!labelSet.has(ref.content)) {
      issues.push({
        type: 'labels', severity: 'error',
        file: ref.match.file, line: ref.match.line,
        message: `\\ref{${ref.content}} has no matching \\label`,
        evidence: ref.content,
      })
    }
  }

  for (const label of labels) {
    if (!refSet.has(label.content)) {
      issues.push({
        type: 'labels', severity: 'warning',
        file: label.match.file, line: label.match.line,
        message: `\\label{${label.content}} is never referenced`,
        evidence: label.content,
      })
    }
  }

  return issues
}

function checkNotation(scanner: LatexScanner): ConsistencyIssue[] {
  const newcommands = scanner.findAll('newcommand')
  const seen = new Map<string, string>()
  const issues: ConsistencyIssue[] = []

  for (const cmd of newcommands) {
    const name = cmd.content
    if (seen.has(name)) {
      issues.push({
        type: 'notation', severity: 'warning',
        file: cmd.match.file, line: cmd.match.line,
        message: `\\newcommand{${name}} defined multiple times (first at ${seen.get(name)})`,
        evidence: name,
      })
    } else {
      seen.set(name, `${cmd.match.file}:${cmd.match.line}`)
    }
  }

  return issues
}

function notImplemented(check: ConsistencyCheckType): ConsistencyIssue {
  return {
    type: check,
    severity: 'info',
    file: '',
    line: 0,
    message: `"${check}" check is not yet implemented`,
    evidence: '',
  }
}

export async function handleConsistencyReport(
  workspace: WorkspaceManager,
  input: Partial<ConsistencyReportInput>
): Promise<ConsistencyReport> {
  const parsed = ConsistencyReportInput.parse(input)
  const scanner = new LatexScanner(workspace)
  const issues: ConsistencyIssue[] = []

  for (const check of parsed.checks as ConsistencyCheckType[]) {
    if (check === 'labels') issues.push(...checkLabels(scanner))
    else if (check === 'notation') issues.push(...checkNotation(scanner))
    else issues.push(notImplemented(check))
  }

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warnCount = issues.filter(i => i.severity === 'warning').length

  return {
    projectName: parsed.projectName,
    checks: parsed.checks as ConsistencyCheckType[],
    issues,
    summary: `Found ${errorCount} error(s) and ${warnCount} warning(s) across ${parsed.checks.join(', ')} checks.`,
  }
}
