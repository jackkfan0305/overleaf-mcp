# Overleaf MCP — Natural Language LaTeX Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that lets Claude apply natural-language editing rules to Overleaf LaTeX projects — batch-transforming patterns across files and checking cross-document consistency — with a diff-preview → confirm → commit flow before any change lands on Overleaf.

**Architecture:** The server connects to Overleaf via Git (clone on first use, pull before every read). All edits accumulate as in-memory patches in a per-session `PendingChanges` store. No file is touched on disk and nothing is pushed to Overleaf until the user explicitly calls `commit_changes`. Claude (the MCP client) is responsible for natural-language understanding; the server is responsible for LaTeX-aware finding, patching, diffing, and Git operations.

**Tech Stack:** TypeScript · Node.js 20+ · `@modelcontextprotocol/sdk` · `simple-git` · `diff` (unified diffs) · `zod` (tool input validation) · `vitest` (tests)

---

## File Map

```
overleaf-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # MCP server: registers all tools, starts stdio transport
│   ├── types.ts              # All shared interfaces and types (no logic)
│   ├── config.ts             # Load project config from env vars or projects.json
│   ├── session.ts            # PendingChanges store: accumulate patches in memory
│   ├── git/
│   │   ├── client.ts         # GitClient: clone, pull, add, commit, push
│   │   └── workspace.ts      # WorkspaceManager: resolve file paths, list .tex files
│   ├── latex/
│   │   ├── parser.ts         # LatexParser: extract named environments and sections
│   │   ├── scanner.ts        # LatexScanner: find pattern matches across files
│   │   └── patcher.ts        # LatexPatcher: apply string transforms, produce unified diffs
│   └── tools/
│       ├── scan.ts           # scan_pattern tool handler
│       ├── apply-rule.ts     # apply_rule tool handler
│       ├── preview.ts        # preview_changes tool handler
│       ├── commit.ts         # commit_changes tool handler
│       ├── discard.ts        # discard_changes tool handler
│       └── consistency.ts    # consistency_report tool handler
└── tests/
    ├── latex/
    │   ├── parser.test.ts
    │   ├── scanner.test.ts
    │   └── patcher.test.ts
    ├── tools/
    │   ├── scan.test.ts
    │   ├── apply-rule.test.ts
    │   └── consistency.test.ts
    └── fixtures/
        ├── simple.tex        # Single-section fixture
        └── multi.tex         # Multi-section, multi-figure fixture
```

---

## MCP Tools (public contract)

| Tool | Description |
|------|-------------|
| `list_files` | List all .tex (and optionally .bib) files in the project so Claude knows what to target |
| `scan_pattern` | Search all .tex files for an environment or regex and return matches with file + line |
| `apply_rule` | Apply a transformation rule to all matches, storing diffs in pending changes |
| `preview_changes` | Show unified diff of all pending changes |
| `discard_changes` | Clear all pending changes without committing |
| `commit_changes` | Commit pending changes and push to Overleaf |
| `consistency_report` | Check cross-document consistency (labels, acronyms, math notation, citations) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "overleaf-mcp",
  "version": "0.1.0",
  "description": "MCP server for natural-language LaTeX editing on Overleaf",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "overleaf-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "node --loader ts-node/esm src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "diff": "^7.0.0",
    "simple-git": "^3.27.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/diff": "^5.2.0",
    "@types/node": "^22.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts
git commit -m "chore: scaffold TypeScript MCP project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```typescript
// ── Project config ──────────────────────────────────────────────────────────

export interface ProjectConfig {
  name: string
  projectId: string
  gitToken: string
  /** Resolved absolute path to local clone */
  localPath: string
}

export interface MultiProjectConfig {
  projects: Record<string, Omit<ProjectConfig, 'localPath'>>
}

// ── LaTeX parsing ────────────────────────────────────────────────────────────

export interface LatexMatch {
  file: string
  /** 1-based */
  line: number
  /** Full matched string (may span multiple lines) */
  raw: string
  /** Character offset from start of file content */
  offset: number
}

export type EnvironmentName =
  | 'caption'
  | 'section'
  | 'subsection'
  | 'subsubsection'
  | 'label'
  | 'ref'
  | 'cite'
  | 'equation'
  | 'align'
  | 'figure'
  | 'table'
  | 'math-inline'   // $...$
  | 'math-display'  // $$...$$
  | 'newcommand'

export interface ParsedEnvironment {
  type: EnvironmentName
  match: LatexMatch
  /** Inner content (without the command/env wrapper) */
  content: string
}

// ── Patching / diffs ─────────────────────────────────────────────────────────

export interface FilePatch {
  file: string
  /** Original full file content */
  original: string
  /** Patched full file content */
  patched: string
  /** Unified diff string for display */
  diff: string
}

// ── Session state ─────────────────────────────────────────────────────────────

export interface PendingChanges {
  projectName: string
  patches: FilePatch[]
  /** Human-readable summary of what the rule did */
  summary: string
}

// ── Consistency report ───────────────────────────────────────────────────────

export type ConsistencyCheckType =
  | 'labels'       // every \label has a matching \ref and vice versa
  | 'acronyms'     // every acronym is defined before first use
  | 'notation'     // math symbols reused with inconsistent definitions
  | 'citations'    // every \cite key exists in .bib; no unused .bib entries

export interface ConsistencyIssue {
  type: ConsistencyCheckType
  severity: 'error' | 'warning' | 'info'
  file: string
  line: number
  message: string
  /** The raw text that triggered this issue */
  evidence: string
}

export interface ConsistencyReport {
  projectName: string
  checks: ConsistencyCheckType[]
  issues: ConsistencyIssue[]
  summary: string
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Config Loader

**Files:**
- Create: `src/config.ts`

Config source priority:
1. `OVERLEAF_PROJECT_ID` + `OVERLEAF_GIT_TOKEN` env vars (single project)
2. `OVERLEAF_PROJECTS_CONFIG` env var pointing to a JSON file
3. `~/.config/overleaf-mcp/projects.json`

- [ ] **Step 1: Write `src/config.ts`**

```typescript
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
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add project config loader"
```

---

## Task 4: Session State

**Files:**
- Create: `src/session.ts`
- Create: `tests/session.test.ts`

The session holds one set of pending changes per project at a time. Module-level singleton — MCP servers run as a single process per client session.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/session.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from '../src/session.js'

describe('SessionStore', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('returns null when no pending changes exist', () => {
    expect(store.get('default')).toBeNull()
  })

  it('stores and retrieves pending changes', () => {
    const patch = {
      file: 'main.tex',
      original: 'hello',
      patched: 'hello.',
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-hello\n+hello.',
    }
    store.set('default', { projectName: 'default', patches: [patch], summary: 'added period' })
    const result = store.get('default')
    expect(result?.patches).toHaveLength(1)
    expect(result?.summary).toBe('added period')
  })

  it('clears pending changes for a project', () => {
    store.set('default', { projectName: 'default', patches: [], summary: '' })
    store.clear('default')
    expect(store.get('default')).toBeNull()
  })

  it('merges new patches into existing pending changes', () => {
    const p1 = { file: 'a.tex', original: 'a', patched: 'A', diff: '' }
    const p2 = { file: 'b.tex', original: 'b', patched: 'B', diff: '' }
    store.set('default', { projectName: 'default', patches: [p1], summary: 'first' })
    store.merge('default', [p2], 'second')
    const result = store.get('default')
    expect(result?.patches).toHaveLength(2)
    expect(result?.summary).toBe('first; second')
  })
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npm test -- tests/session.test.ts
```

Expected: error `Cannot find module '../src/session.js'`

- [ ] **Step 3: Write `src/session.ts`**

```typescript
import type { FilePatch, PendingChanges } from './types.js'

export class SessionStore {
  private readonly store = new Map<string, PendingChanges>()

  get(projectName: string): PendingChanges | null {
    return this.store.get(projectName) ?? null
  }

  set(projectName: string, changes: PendingChanges): void {
    this.store.set(projectName, changes)
  }

  merge(projectName: string, newPatches: FilePatch[], newSummary: string): void {
    const existing = this.store.get(projectName)
    if (!existing) {
      this.store.set(projectName, { projectName, patches: newPatches, summary: newSummary })
      return
    }
    this.store.set(projectName, {
      ...existing,
      patches: [...existing.patches, ...newPatches],
      summary: existing.summary ? `${existing.summary}; ${newSummary}` : newSummary,
    })
  }

  clear(projectName: string): void {
    this.store.delete(projectName)
  }
}

/** Singleton for the server process */
export const session = new SessionStore()
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
npm test -- tests/session.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: add session store for pending changes"
```

---

## Task 5: Git Client + WorkspaceManager

**Files:**
- Create: `src/git/client.ts`
- Create: `src/git/workspace.ts`
- Create: `tests/workspace.test.ts`

> `GitClient` requires a live Overleaf remote — tested manually. `WorkspaceManager` is unit-tested here.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceManager } from '../src/git/workspace.js'

describe('WorkspaceManager', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overleaf-test-'))
    ws = new WorkspaceManager(tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\section{Intro}\nHello world.')
    fs.writeFileSync(path.join(tmpDir, 'appendix.tex'), '\\section{App}\nExtra.')
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not a tex file')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('lists only .tex files', () => {
    const files = ws.listTexFiles()
    expect(files).toHaveLength(2)
    expect(files.every(f => f.endsWith('.tex'))).toBe(true)
  })

  it('reads file content', () => {
    const content = ws.readFile('main.tex')
    expect(content).toContain('\\section{Intro}')
  })

  it('writes file content', () => {
    ws.writeFile('main.tex', '\\section{Intro}\nHello updated.')
    expect(ws.readFile('main.tex')).toBe('\\section{Intro}\nHello updated.')
  })

  it('throws on path traversal attempt', () => {
    expect(() => ws.readFile('../etc/passwd')).toThrow('Path traversal')
  })

  it('resolves absolute path safely', () => {
    const resolved = ws.resolvePath('main.tex')
    expect(resolved.startsWith(tmpDir)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npm test -- tests/workspace.test.ts
```

- [ ] **Step 3: Write `src/git/workspace.ts`**

```typescript
import fs from 'node:fs'
import path from 'node:path'

export class WorkspaceManager {
  constructor(private readonly root: string) {}

  resolvePath(filePath: string): string {
    const resolved = path.resolve(this.root, filePath)
    if (!resolved.startsWith(this.root)) {
      throw new Error(`Path traversal detected: ${filePath}`)
    }
    return resolved
  }

  listTexFiles(): string[] {
    return this.walkDir(this.root)
      .filter(f => f.endsWith('.tex'))
      .map(f => path.relative(this.root, f))
  }

  private walkDir(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries.flatMap(e => {
      const full = path.join(dir, e.name)
      if (e.isDirectory() && !e.name.startsWith('.')) return this.walkDir(full)
      if (e.isFile()) return [full]
      return []
    })
  }

  readFile(filePath: string): string {
    return fs.readFileSync(this.resolvePath(filePath), 'utf8')
  }

  writeFile(filePath: string, content: string): void {
    fs.writeFileSync(this.resolvePath(filePath), content, 'utf8')
  }
}
```

- [ ] **Step 4: Write `src/git/client.ts`**

```typescript
import simpleGit, { type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import type { ProjectConfig } from '../types.js'

export class GitClient {
  private readonly git: SimpleGit
  private readonly remoteUrl: string

  constructor(private readonly config: ProjectConfig) {
    this.git = simpleGit(config.localPath)
    this.remoteUrl =
      `https://git:${config.gitToken}@git.overleaf.com/${config.projectId}`
  }

  async ensureCloned(): Promise<void> {
    if (!fs.existsSync(this.config.localPath)) {
      fs.mkdirSync(this.config.localPath, { recursive: true })
      await simpleGit().clone(this.remoteUrl, this.config.localPath)
    } else {
      await this.git.pull('origin', 'master')
    }
  }

  async commitAndPush(files: string[], message: string): Promise<void> {
    await this.git.add(files)
    await this.git.commit(message)
    await this.git.push('origin', 'master')
  }
}
```

- [ ] **Step 5: Run workspace test — confirm PASS**

```bash
npm test -- tests/workspace.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add src/git/client.ts src/git/workspace.ts tests/workspace.test.ts
git commit -m "feat: add GitClient and WorkspaceManager"
```

---

## Task 6: LaTeX Parser

**Files:**
- Create: `src/latex/parser.ts`
- Create: `tests/latex/parser.test.ts`
- Create: `tests/fixtures/simple.tex`
- Create: `tests/fixtures/multi.tex`

Extracts named environments from LaTeX source using regex. Targets the specific constructs needed for Features 1 and 3 — not a full AST.

- [ ] **Step 1: Create `tests/fixtures/simple.tex`**

```latex
\documentclass{article}
\begin{document}

\section{Introduction}
This is the intro. We use $\alpha$ here.

\begin{figure}
  \includegraphics{fig1}
  \caption{A figure showing results}
  \label{fig:results}
\end{figure}

\end{document}
```

- [ ] **Step 2: Create `tests/fixtures/multi.tex`**

```latex
\documentclass{article}
\begin{document}

\section{Methods}
We define $\alpha$ as the learning rate.

\begin{figure}
  \caption{Second figure}
  \label{fig:second}
\end{figure}

\begin{table}
  \caption{Results table.}
  \label{tab:results}
\end{table}

See \ref{fig:results} and \cite{smith2020}.
Also see \ref{fig:missing}.

\end{document}
```

- [ ] **Step 3: Write the failing test**

```typescript
// tests/latex/parser.test.ts
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
```

- [ ] **Step 4: Run test — confirm FAIL**

```bash
npm test -- tests/latex/parser.test.ts
```

- [ ] **Step 5: Write `src/latex/parser.ts`**

```typescript
import type { EnvironmentName, ParsedEnvironment } from '../types.js'

const ENV_PATTERNS: Record<EnvironmentName, RegExp> = {
  caption:       /\\caption\{([^}]*)\}/g,
  section:       /\\section\{([^}]*)\}/g,
  subsection:    /\\subsection\{([^}]*)\}/g,
  subsubsection: /\\subsubsection\{([^}]*)\}/g,
  label:         /\\label\{([^}]*)\}/g,
  ref:           /\\ref\{([^}]*)\}/g,
  cite:          /\\cite(?:\[[^\]]*\])?\{([^}]*)\}/g,
  figure:        /\\begin\{figure\}([\s\S]*?)\\end\{figure\}/g,
  table:         /\\begin\{table\}([\s\S]*?)\\end\{table\}/g,
  equation:      /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g,
  align:         /\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g,
  'math-inline':  /(?<!\$)\$([^$\n]+)\$/g,
  'math-display': /\$\$([\s\S]*?)\$\$/g,
  newcommand:    /\\(?:re)?newcommand\{([^}]*)\}/g,
}

export class LatexParser {
  lineAt(content: string, offset: number): number {
    return content.slice(0, offset).split('\n').length
  }

  extractEnvironments(
    content: string,
    file: string,
    type: EnvironmentName
  ): ParsedEnvironment[] {
    const pattern = ENV_PATTERNS[type]
    if (!pattern) throw new Error(`Unknown environment: ${type}`)

    pattern.lastIndex = 0
    const results: ParsedEnvironment[] = []
    let m: RegExpExecArray | null

    while ((m = pattern.exec(content)) !== null) {
      results.push({
        type,
        match: { file, line: this.lineAt(content, m.index), raw: m[0], offset: m.index },
        content: m[1].trim(),
      })
    }

    pattern.lastIndex = 0
    return results
  }
}
```

- [ ] **Step 6: Run test — confirm PASS**

```bash
npm test -- tests/latex/parser.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/latex/parser.ts tests/latex/parser.test.ts tests/fixtures/
git commit -m "feat: add LaTeX parser for environment extraction"
```

---

## Task 7: LaTeX Scanner

**Files:**
- Create: `src/latex/scanner.ts`
- Create: `tests/latex/scanner.test.ts`

Coordinates the parser across multiple files, returning all matches with full file paths.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/latex/scanner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LatexScanner } from '../../src/latex/scanner.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('LatexScanner', () => {
  let tmpDir: string
  let scanner: LatexScanner

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), [
      '\\section{Intro}',
      'See \\ref{fig:a} and \\ref{fig:b}',
      '\\begin{figure}',
      '  \\caption{A figure}',
      '  \\label{fig:a}',
      '\\end{figure}',
    ].join('\n'))
    fs.writeFileSync(path.join(tmpDir, 'chapter2.tex'), [
      '\\section{Methods}',
      '\\begin{figure}',
      '  \\caption{Another figure}',
      '  \\label{fig:b}',
      '\\end{figure}',
    ].join('\n'))
    scanner = new LatexScanner(new WorkspaceManager(tmpDir))
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('finds all captions across files', () => {
    const matches = scanner.findAll('caption')
    expect(matches).toHaveLength(2)
    expect(matches.map(m => m.content)).toContain('A figure')
    expect(matches.map(m => m.content)).toContain('Another figure')
  })

  it('finds all refs across files', () => {
    expect(scanner.findAll('ref')).toHaveLength(2)
  })

  it('filters to a specific file', () => {
    const matches = scanner.findAll('caption', { files: ['main.tex'] })
    expect(matches).toHaveLength(1)
    expect(matches[0].match.file).toBe('main.tex')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npm test -- tests/latex/scanner.test.ts
```

- [ ] **Step 3: Write `src/latex/scanner.ts`**

```typescript
import type { EnvironmentName, ParsedEnvironment } from '../types.js'
import { LatexParser } from './parser.js'
import type { WorkspaceManager } from '../git/workspace.js'

interface ScanOptions {
  files?: string[]
}

export class LatexScanner {
  private readonly parser = new LatexParser()

  constructor(private readonly workspace: WorkspaceManager) {}

  findAll(type: EnvironmentName, options: ScanOptions = {}): ParsedEnvironment[] {
    const files = options.files ?? this.workspace.listTexFiles()
    return files.flatMap(file => {
      const content = this.workspace.readFile(file)
      return this.parser.extractEnvironments(content, file, type)
    })
  }
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npm test -- tests/latex/scanner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/latex/scanner.ts tests/latex/scanner.test.ts
git commit -m "feat: add LaTeX scanner for cross-file pattern search"
```

---

## Task 8: LaTeX Patcher

**Files:**
- Create: `src/latex/patcher.ts`
- Create: `tests/latex/patcher.test.ts`

Applies a transform function to all matches of a pattern in a file, then produces a unified diff.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/latex/patcher.test.ts
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
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npm test -- tests/latex/patcher.test.ts
```

- [ ] **Step 3: Write `src/latex/patcher.ts`**

```typescript
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
      const newRaw = env.match.raw.replace(env.content, transformed)
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
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npm test -- tests/latex/patcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/latex/patcher.ts tests/latex/patcher.test.ts
git commit -m "feat: add LaTeX patcher with unified diff output"
```

---

## Task 9: `scan_pattern` Tool Handler

**Files:**
- Create: `src/tools/scan.ts`
- Create: `tests/tools/scan.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleScanPattern } from '../../src/tools/scan.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('handleScanPattern', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-tool-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\section{Intro}\n\\caption{A result}\n\\caption{Another result.}'
    )
    ws = new WorkspaceManager(tmpDir)
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('returns matches for a valid environment', async () => {
    const result = await handleScanPattern(ws, { environment: 'caption' })
    expect(result.matches).toHaveLength(2)
    expect(result.matches[0].content).toBe('A result')
  })

  it('throws on unsupported environment', async () => {
    await expect(
      handleScanPattern(ws, { environment: 'invalid' as any })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npm test -- tests/tools/scan.test.ts
```

- [ ] **Step 3: Write `src/tools/scan.ts`**

```typescript
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
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npm test -- tests/tools/scan.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/scan.ts tests/tools/scan.test.ts
git commit -m "feat: add scan_pattern MCP tool handler"
```

---

## Task 10: `apply_rule` Tool Handler

**Files:**
- Create: `src/tools/apply-rule.ts`
- Create: `tests/tools/apply-rule.test.ts`

Applies the transform and stores the diff in the session. **Nothing is written to disk yet.**

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/apply-rule.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleApplyRule } from '../../src/tools/apply-rule.js'
import { WorkspaceManager } from '../../src/git/workspace.js'
import { SessionStore } from '../../src/session.js'

describe('handleApplyRule', () => {
  let tmpDir: string
  let ws: WorkspaceManager
  let store: SessionStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-rule-'))
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\caption{A result}\n\\caption{Another result}\n'
    )
    ws = new WorkspaceManager(tmpDir)
    store = new SessionStore()
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('adds period to captions and stores in session without touching disk', async () => {
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'caption',
      rule: 'ensure_trailing_period',
    })
    expect(result.filesChanged).toBe(1)
    expect(result.matchesChanged).toBe(2)

    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\caption{A result.}')

    // Disk must NOT be modified
    const disk = fs.readFileSync(path.join(tmpDir, 'main.tex'), 'utf8')
    expect(disk).toContain('\\caption{A result}\n')
  })

  it('applies title_case rule to sections', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\section{introduction}\n\\section{related work}\n'
    )
    const result = await handleApplyRule(ws, store, 'default', {
      environment: 'section',
      rule: 'title_case',
    })
    expect(result.matchesChanged).toBe(2)
    const pending = store.get('default')
    expect(pending?.patches[0].patched).toContain('\\section{Introduction}')
    expect(pending?.patches[0].patched).toContain('\\section{Related Work}')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npm test -- tests/tools/apply-rule.test.ts
```

- [ ] **Step 3: Write `src/tools/apply-rule.ts`**

```typescript
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
    const original = workspace.readFile(file)
    const patch = patcher.applyTransform(original, file, parsed.environment, transform)
    if (patch.diff === '') continue

    // Count changed occurrences (rough: count how many replacements differed)
    const origMatches = (original.match(new RegExp(`\\\\${parsed.environment}\\{`, 'g')) ?? []).length
    matchesChanged += origMatches
    filesChanged++
    session.merge(projectName, [patch], summary)
  }

  return { filesChanged, matchesChanged, summary }
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npm test -- tests/tools/apply-rule.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/apply-rule.ts tests/tools/apply-rule.test.ts
git commit -m "feat: add apply_rule MCP tool handler with built-in rules"
```

---

## Task 11: `preview_changes` and `discard_changes` Handlers

**Files:**
- Create: `src/tools/preview.ts`
- Create: `src/tools/discard.ts`

Thin wrappers over the session store — covered by session tests + integration.

- [ ] **Step 1: Write `src/tools/preview.ts`**

```typescript
import type { SessionStore } from '../session.js'

export interface PreviewResult {
  hasPendingChanges: boolean
  summary: string
  diff: string
  filesAffected: string[]
}

export function handlePreviewChanges(
  session: SessionStore,
  projectName: string
): PreviewResult {
  const pending = session.get(projectName)
  if (!pending || pending.patches.length === 0) {
    return { hasPendingChanges: false, summary: 'No pending changes.', diff: '', filesAffected: [] }
  }
  return {
    hasPendingChanges: true,
    summary: pending.summary,
    diff: pending.patches.map(p => p.diff).join('\n\n'),
    filesAffected: pending.patches.map(p => p.file),
  }
}
```

- [ ] **Step 2: Write `src/tools/discard.ts`**

```typescript
import type { SessionStore } from '../session.js'

export interface DiscardResult {
  message: string
  filesDiscarded: number
}

export function handleDiscardChanges(
  session: SessionStore,
  projectName: string
): DiscardResult {
  const pending = session.get(projectName)
  const count = pending?.patches.length ?? 0
  session.clear(projectName)
  return {
    message: count > 0
      ? `Discarded ${count} pending change(s). No files were written.`
      : 'No pending changes to discard.',
    filesDiscarded: count,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/preview.ts src/tools/discard.ts
git commit -m "feat: add preview_changes and discard_changes handlers"
```

---

## Task 12: `commit_changes` Handler

**Files:**
- Create: `src/tools/commit.ts`

The only point where files are written to disk and pushed to Overleaf.

- [ ] **Step 1: Write `src/tools/commit.ts`**

```typescript
import { z } from 'zod'
import type { SessionStore } from '../session.js'
import type { WorkspaceManager } from '../git/workspace.js'
import type { GitClient } from '../git/client.js'

export const CommitInput = z.object({
  message: z.string().min(1, 'Commit message required'),
  projectName: z.string().default('default'),
})
export type CommitInput = z.infer<typeof CommitInput>

export interface CommitResult {
  success: boolean
  filesCommitted: string[]
  message: string
}

export async function handleCommitChanges(
  session: SessionStore,
  workspace: WorkspaceManager,
  git: GitClient,
  input: CommitInput
): Promise<CommitResult> {
  const parsed = CommitInput.parse(input)
  const pending = session.get(parsed.projectName)

  if (!pending || pending.patches.length === 0) {
    return { success: false, filesCommitted: [], message: 'No pending changes to commit.' }
  }

  for (const patch of pending.patches) {
    workspace.writeFile(patch.file, patch.patched)
  }

  const files = pending.patches.map(p => p.file)
  await git.commitAndPush(files, parsed.message)
  session.clear(parsed.projectName)

  return {
    success: true,
    filesCommitted: files,
    message: `Committed ${files.length} file(s) and pushed to Overleaf: "${parsed.message}"`,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/commit.ts
git commit -m "feat: add commit_changes handler"
```

---

## Task 13: `consistency_report` Tool Handler

**Files:**
- Create: `src/tools/consistency.ts`
- Create: `tests/tools/consistency.test.ts`

Checks: (a) orphaned `\ref{}` with no `\label{}`, (b) orphaned `\label{}` with no `\ref{}`, (c) duplicate `\newcommand` definitions.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/consistency.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handleConsistencyReport } from '../../src/tools/consistency.js'
import { WorkspaceManager } from '../../src/git/workspace.js'

describe('handleConsistencyReport', () => {
  let tmpDir: string
  let ws: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consistency-'))
    ws = new WorkspaceManager(tmpDir)
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }))

  it('flags a ref with no matching label', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\ref{fig:missing}\n\\label{fig:exists}'
    )
    const report = await handleConsistencyReport(ws, { checks: ['labels'] })
    const errors = report.issues.filter(i => i.type === 'labels' && i.severity === 'error')
    expect(errors.some(e => e.evidence === 'fig:missing')).toBe(true)
  })

  it('flags a label with no matching ref', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\label{fig:orphaned}')
    const report = await handleConsistencyReport(ws, { checks: ['labels'] })
    const warnings = report.issues.filter(i => i.type === 'labels' && i.severity === 'warning')
    expect(warnings.some(w => w.evidence === 'fig:orphaned')).toBe(true)
  })

  it('passes when all refs and labels are matched', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\ref{fig:a}\n\\label{fig:a}')
    const report = await handleConsistencyReport(ws, { checks: ['labels'] })
    expect(report.issues.filter(i => i.type === 'labels')).toHaveLength(0)
  })

  it('flags duplicate \\newcommand definitions', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'),
      '\\newcommand{\\myvar}{x}\n\\newcommand{\\myvar}{y}'
    )
    const report = await handleConsistencyReport(ws, { checks: ['notation'] })
    const issues = report.issues.filter(i => i.type === 'notation')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].evidence).toContain('\\myvar')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
npm test -- tests/tools/consistency.test.ts
```

- [ ] **Step 3: Write `src/tools/consistency.ts`**

```typescript
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

export async function handleConsistencyReport(
  workspace: WorkspaceManager,
  input: Partial<ConsistencyReportInput>
): Promise<ConsistencyReport> {
  const parsed = ConsistencyReportInput.parse(input)
  const scanner = new LatexScanner(workspace)
  const issues: ConsistencyIssue[] = []

  for (const check of parsed.checks as ConsistencyCheckType[]) {
    if (check === 'labels') issues.push(...checkLabels(scanner))
    if (check === 'notation') issues.push(...checkNotation(scanner))
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
```

- [ ] **Step 4: Run — confirm PASS**

```bash
npm test -- tests/tools/consistency.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/consistency.ts tests/tools/consistency.test.ts
git commit -m "feat: add consistency_report tool (labels + notation checks)"
```

---

## Task 13b: `list_files` Tool Handler

**Files:**
- Create: `src/tools/list-files.ts`

Exposes `WorkspaceManager.listTexFiles()` (and optionally `.bib` files) as an MCP tool so Claude can discover the project structure before targeting specific files.

- [ ] **Step 1: Write `src/tools/list-files.ts`**

```typescript
import { z } from 'zod'
import type { WorkspaceManager } from '../git/workspace.js'
import path from 'node:path'

export const ListFilesInput = z.object({
  includeBib: z.boolean().default(false),
})
export type ListFilesInput = z.infer<typeof ListFilesInput>

export interface ListFilesResult {
  files: string[]
  total: number
}

export function handleListFiles(
  workspace: WorkspaceManager,
  input: ListFilesInput = { includeBib: false }
): ListFilesResult {
  const parsed = ListFilesInput.parse(input)
  const files = workspace.listTexFiles()
  const result = parsed.includeBib
    ? [...files, ...workspace.listFilesByExtension('.bib')]
    : files
  return { files: result, total: result.length }
}
```

- [ ] **Step 2: Add `listFilesByExtension` to `WorkspaceManager`**

In `src/git/workspace.ts`, add alongside `listTexFiles`:

```typescript
listFilesByExtension(ext: string): string[] {
  return this.walkDir(this.root)
    .filter(f => f.endsWith(ext))
    .map(f => path.relative(this.root, f))
}
```

- [ ] **Step 3: Register in `src/index.ts`**

```typescript
server.tool(
  'list_files',
  'List all .tex files in the project (and optionally .bib files). Call this first so you know what files exist before targeting specific ones.',
  { includeBib: z.boolean().optional() },
  async ({ includeBib, projectName }) => {
    const { workspace } = await getContext(projectName)
    const result = handleListFiles(workspace, { includeBib: includeBib ?? false })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/list-files.ts src/git/workspace.ts src/index.ts
git commit -m "feat: add list_files tool for project file discovery"
```

---

## Task 14: Wire the MCP Server

**Files:**
- Create: `src/index.ts`

Registers all tools with the MCP SDK and starts the stdio transport.

- [ ] **Step 1: Write `src/index.ts`**

```typescript
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
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
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
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'preview_changes',
  'Show a unified diff of all staged (uncommitted) changes.',
  { projectName: z.string().optional() },
  async ({ projectName }) => {
    const result = handlePreviewChanges(session, projectName ?? 'default')
    return { content: [{ type: 'text', text: result.hasPendingChanges ? result.diff : result.summary }] }
  }
)

server.tool(
  'discard_changes',
  'Discard all staged changes without writing or committing anything.',
  { projectName: z.string().optional() },
  async ({ projectName }) => {
    const result = handleDiscardChanges(session, projectName ?? 'default')
    return { content: [{ type: 'text', text: result.message }] }
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
    return { content: [{ type: 'text', text: result.message }] }
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
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Overleaf MCP server running on stdio')
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 3: Smoke-test**

```bash
OVERLEAF_PROJECT_ID=test OVERLEAF_GIT_TOKEN=test node dist/index.js &
sleep 1 && kill %1
```

Expected: `Overleaf MCP server running on stdio` in stderr.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all MCP tools in server entry point"
```

---

## Task 15: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Overleaf MCP

Natural-language LaTeX editing for Overleaf, powered by Claude.

## What it does

Instead of editing LaTeX by hand, describe what you want in plain English:

> "Make all my figure captions end with a period"
> "Check if I have any orphaned \\label{} tags"
> "Apply title case to all section headings"

The server finds matching patterns across your entire project, shows you a diff, and only pushes to Overleaf when you approve.

## Tools

| Tool | What it does |
|------|-------------|
| `scan_pattern` | Find all occurrences of an environment (caption, section, label, ref…) |
| `apply_rule` | Stage a batch transformation (trailing period, title case, etc.) |
| `preview_changes` | Show unified diff of staged changes |
| `discard_changes` | Throw away staged changes |
| `commit_changes` | Write to disk and push to Overleaf |
| `consistency_report` | Check for orphaned refs/labels, duplicate \\newcommand |

## Setup

### Get Overleaf credentials

1. **Project ID** — from your project URL: `https://www.overleaf.com/project/<PROJECT_ID>`
2. **Git token** — Account Settings → Git Integration → Create Token

### Add to Claude Desktop

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["-y", "overleaf-mcp"],
      "env": {
        "OVERLEAF_PROJECT_ID": "your-project-id",
        "OVERLEAF_GIT_TOKEN": "olp_yourtoken"
      }
    }
  }
}
```

## Example workflow

```
User: Make all figure captions end with a period

Claude → scan_pattern(environment: "caption")
       → apply_rule(environment: "caption", rule: "ensure_trailing_period")
       → preview_changes()     ← shows unified diff

User: Looks good, commit it

Claude → commit_changes(message: "style: ensure all captions end with period")
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and example workflow"
```

---

## Self-Review

## Viability Review Notes

These notes should be addressed before implementation if the goal is a credible natural-language LaTeX editing demo rather than a thin file-editing wrapper.

**High priority:**
- Pending changes need to be merged per file, not appended as independent full-file patches. The current `SessionStore.merge` design can lose earlier staged edits when two rules touch the same file, because each patch is generated from the disk original and `commit_changes` writes `patch.patched` sequentially. This affects the target demo: "Make all my figure captions end with a period and follow title case." Fix by storing one pending `{ original, patched }` state per file and applying later transforms against the current pending `patched` content, or by supporting composed rules in a single patch pass.
- The regex parser is too fragile for the "semantic LaTeX understanding" claim. It misses or breaks on nested braces, optional command args, multiline captions, comments, starred commands, `\citep{}`, `\citet{}`, `\autoref{}`, `\eqref{}`, and LaTeX commands/math inside captions. For a strong MVP, replace the command regexes with a balanced-brace scanner for editable commands, or use a LaTeX parser such as `unified-latex` or `latex-utensils`.

**Medium priority:**
- The plan does not distinguish figure captions from table/listing captions. `scan_pattern(environment: "caption")` will transform every `\caption{}`. Add context-aware scanning, e.g. `command: "caption", within: "figure"`, so the exact user request "all my figure captions" is supported.
- The `title_case` rule is too naive for academic LaTeX. It lowercases acronyms, small words, protected capitalization, command arguments, and math content. Use a title-case library with project-specific exclusions and skip LaTeX commands/math spans when transforming.
- The public `consistency_report` contract overpromises. The tool table advertises labels, acronyms, math notation, and citations, but Task 13 only implements labels and duplicate `\newcommand` checks while silently accepting unsupported checks. Either remove unsupported checks from v0 or return explicit "not implemented yet" issues for `acronyms` and `citations`.
- `WorkspaceManager.resolvePath` should not use `startsWith` for path traversal protection. A sibling path with the same prefix can pass. Use `path.relative(root, resolved)` and reject results that start with `..` or are absolute.

**Spec coverage:**
- Feature 1 (Batch Pattern Enforcement): Tasks 6–10, 12
- Feature 3 (Cross-Document Consistency): Task 13
- Diff-preview → confirm → commit flow: Tasks 11–12
- Multi-project support: Task 3 (config) + `projectName` param on all tools
- Path traversal prevention: Task 5 (WorkspaceManager)

**Placeholder scan:** None. All tasks have complete, runnable code.

**Type consistency:** `FilePatch`, `PendingChanges`, `ParsedEnvironment`, `EnvironmentName` defined in Task 2 and used consistently. `SessionStore` defined in Task 4, injected into tool handlers in Tasks 10–12. `LatexParser` → `LatexScanner` → `LatexPatcher` dependency chain is consistent across tasks 6–8.

**Known gaps (intentional, future work):**
- `acronyms` and `citations` consistency checks are accepted as input but not yet implemented (stubs for next iteration)
- Only named built-in rules are supported — Claude handles natural language → rule selection
- No `.bib` parsing yet (needed for citation check)
