import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

function startServer(): Promise<{ stderr: string; stdout: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['--loader', 'ts-node/esm', 'src/index.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        OVERLEAF_PROJECT_ID: 'test-project-id',
        OVERLEAF_GIT_TOKEN: 'test-token',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })

    // Send a valid JSON-RPC initialize request
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.1' },
      },
    })
    child.stdin.write(initRequest + '\n')

    // List tools after init
    setTimeout(() => {
      const listTools = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      })
      child.stdin.write(listTools + '\n')
    }, 500)

    setTimeout(() => {
      child.kill('SIGTERM')
    }, 2000)

    child.on('close', (code) => {
      resolve({ stderr, stdout, exitCode: code })
    })
  })
}

describe('MCP server entry point', () => {
  it('starts and prints startup message to stderr', async () => {
    const { stderr } = await startServer()
    expect(stderr).toContain('Overleaf MCP server running on stdio')
  }, 10000)

  it('registers all expected tools', async () => {
    const { stdout } = await startServer()
    const expectedTools = [
      'scan_pattern',
      'apply_rule',
      'preview_changes',
      'discard_changes',
      'commit_changes',
      'consistency_report',
    ]
    for (const tool of expectedTools) {
      expect(stdout).toContain(tool)
    }
  }, 10000)
})
