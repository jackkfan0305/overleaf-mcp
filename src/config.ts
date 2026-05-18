import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { MultiProjectConfig, ProjectConfig } from './types.js'

const CLONE_BASE = path.join(os.homedir(), '.overleaf-mcp', 'clones')

function resolveLocalPath(projectId: string): string {
  return path.join(CLONE_BASE, projectId)
}

function loadFromFile(filePath: string): MultiProjectConfig {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as MultiProjectConfig
}

export function loadConfig(): MultiProjectConfig {
  // 1. Single-project env vars
  const id = process.env.OVERLEAF_PROJECT_ID
  const token = process.env.OVERLEAF_GIT_TOKEN
  if (id && token) {
    return {
      projects: {
        default: {
          name: process.env.OVERLEAF_PROJECT_NAME ?? 'My Project',
          projectId: id,
          gitToken: token,
        },
      },
    }
  }

  // 2. Explicit config file path
  const explicit = process.env.OVERLEAF_PROJECTS_CONFIG
  if (explicit) return loadFromFile(explicit)

  // 3. XDG / home config
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  const defaultPath = path.join(xdg, 'overleaf-mcp', 'projects.json')
  if (fs.existsSync(defaultPath)) return loadFromFile(defaultPath)

  throw new Error(
    'No Overleaf config found. Set OVERLEAF_PROJECT_ID + OVERLEAF_GIT_TOKEN, ' +
    'or create ~/.config/overleaf-mcp/projects.json'
  )
}

export function resolveProject(
  config: MultiProjectConfig,
  name: string = 'default'
): ProjectConfig {
  const entry = config.projects[name]
  if (!entry) {
    const available = Object.keys(config.projects).join(', ')
    throw new Error(`Project "${name}" not found. Available: ${available}`)
  }
  return { ...entry, localPath: resolveLocalPath(entry.projectId) }
}
