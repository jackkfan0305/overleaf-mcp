#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { loadConfig, resolveProject } from './config.js'
import { session } from './session.js'
import { GitClient } from './git/client.js'
import { WorkspaceManager } from './git/workspace.js'
import { handleScanPattern } from './tools/scan.js'
import { handleApplyRule } from './tools/apply-rule.js'
import { handlePreviewChanges } from './tools/preview.js'
import { handleDiscardChanges } from './tools/discard.js'
import { handleCommitChanges } from './tools/commit.js'
import { handleConsistencyReport } from './tools/consistency.js'

const config = loadConfig()
const server = new McpServer({ name: 'overleaf-mcp', version: '0.1.0' })

async function getContext(projectName = 'default') {
  const project = resolveProject(config, projectName)
  const git = new GitClient(project)
  await git.ensureCloned()
  return { project, git, workspace: new WorkspaceManager(project.localPath) }
}

server.tool(
  'scan_pattern',
  'Search all .tex files for a LaTeX environment (caption, section, label, ref, cite, math-inline, etc.) and return every match with file and line number.',
  {
    environment: z.string().describe('LaTeX environment to search for'),
    files: z.array(z.string()).optional().describe('Limit to specific files (optional)'),
    projectName: z.string().optional(),
  },
  async ({ environment, files, projectName }) => {
    const { workspace } = await getContext(projectName)
    const result = await handleScanPattern(workspace, { environment: environment as any, files })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'apply_rule',
  'Stage a batch transformation rule on all occurrences of a LaTeX environment. Changes are held in memory until commit_changes is called. Available rules: ensure_trailing_period | remove_trailing_period | title_case | sentence_case | uppercase | lowercase',
  {
    environment: z.string().describe('LaTeX environment to transform (caption, section, subsection, label)'),
    rule: z.string().describe('Rule name to apply'),
    files: z.array(z.string()).optional(),
    projectName: z.string().optional(),
  },
  async ({ environment, rule, files, projectName }) => {
    const { workspace } = await getContext(projectName)
    const result = await handleApplyRule(
      workspace, session, projectName ?? 'default',
      { environment: environment as any, rule: rule as any, files }
    )
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'preview_changes',
  'Show a unified diff of all staged (uncommitted) changes.',
  { projectName: z.string().optional() },
  async ({ projectName }) => {
    const result = handlePreviewChanges(session, projectName ?? 'default')
    return { content: [{ type: 'text' as const, text: result.hasPendingChanges ? result.diff : result.summary }] }
  }
)

server.tool(
  'discard_changes',
  'Discard all staged changes without writing or committing anything.',
  { projectName: z.string().optional() },
  async ({ projectName }) => {
    const result = handleDiscardChanges(session, projectName ?? 'default')
    return { content: [{ type: 'text' as const, text: result.message }] }
  }
)

server.tool(
  'commit_changes',
  'Write all staged changes to disk and push to Overleaf via Git.',
  {
    message: z.string().describe('Git commit message'),
    projectName: z.string().optional(),
  },
  async ({ message, projectName }) => {
    const { workspace, git } = await getContext(projectName)
    const result = await handleCommitChanges(
      session, workspace, git,
      { message, projectName: projectName ?? 'default' }
    )
    return { content: [{ type: 'text' as const, text: result.message }] }
  }
)

server.tool(
  'consistency_report',
  'Analyze the project for cross-document consistency issues: orphaned labels/refs and duplicate \\newcommand definitions.',
  {
    checks: z.array(z.string()).optional().describe('labels | notation (default: both)'),
    projectName: z.string().optional(),
  },
  async ({ checks, projectName }) => {
    const { workspace } = await getContext(projectName)
    const report = await handleConsistencyReport(workspace, {
      checks: checks as any,
      projectName: projectName ?? 'default',
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Overleaf MCP server running on stdio')
