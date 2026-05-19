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
  /** Latest pending patch per file. Use this for merge/apply semantics. */
  patchesByFile: Record<string, FilePatch>
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

// ── PDF compile ───────────────────────────────────────────────────────────────

export type LatexEngine = 'pdflatex' | 'xelatex' | 'lualatex'

export interface CompilePdfResult {
  success: boolean
  mainFile: string
  pdfPath: string | null
  logPath: string | null
  command: string
  stdout: string
  stderr: string
  message: string
}

export interface DownloadPdfResult {
  success: boolean
  sourcePath: string | null
  destinationPath: string | null
  message: string
}
