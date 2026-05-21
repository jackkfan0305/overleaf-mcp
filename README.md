# Overleaf MCP

An MCP server for natural-language LaTeX editing on Overleaf. Describe what you want in plain English and let Claude handle the find-and-replace across your entire project.

> "Make all my figure captions end with a period"
> "Check if I have any orphaned \label{} tags"
> "Apply title case to all section headings"

The server clones your Overleaf project via Git, finds matching LaTeX patterns, stages changes in memory, shows you a unified diff, and only pushes to Overleaf when you approve.

## How it works

```
You:    "Make all figure captions end with a period"

Claude: scan_pattern(environment: "caption")
        → Found 14 captions across 3 files

        apply_rule(environment: "caption", rule: "ensure_trailing_period")
        → 9 captions updated, 5 already had periods

        preview_changes()
        → Shows unified diff of all 9 changes

You:    "Looks good, commit it"

Claude: commit_changes(message: "style: ensure all captions end with period")
        → Pushed to Overleaf ✓
```

Changes appear in Overleaf within seconds. No manual find-and-replace, no missed occurrences, no broken LaTeX.

## Tools

| Tool | Description |
|------|-------------|
| `scan_pattern` | Search `.tex` files for a LaTeX environment and return every match with file, line number, and content |
| `apply_rule` | Stage a batch transformation on all matches. Changes are held in memory until you commit |
| `preview_changes` | Show a unified diff of everything staged so far |
| `discard_changes` | Throw away all staged changes without writing anything |
| `commit_changes` | Write staged changes to disk, commit, and push to Overleaf via Git |
| `consistency_report` | Analyze the project for orphaned labels/refs and duplicate `\newcommand` definitions |

### Supported environments

`scan_pattern` and `apply_rule` understand these LaTeX constructs:

| Environment | What it matches |
|-------------|----------------|
| `caption` | `\caption{...}` |
| `section` | `\section{...}` |
| `subsection` | `\subsection{...}` |
| `subsubsection` | `\subsubsection{...}` |
| `label` | `\label{...}` |
| `ref` | `\ref{...}` |
| `cite` | `\cite{...}` |
| `equation` | `\begin{equation}...\end{equation}` |
| `align` | `\begin{align}...\end{align}` |
| `figure` | `\begin{figure}...\end{figure}` |
| `table` | `\begin{table}...\end{table}` |
| `math-inline` | `$...$` |
| `math-display` | `$$...$$` |
| `newcommand` | `\newcommand{...}{...}` |

### Transformation rules

`apply_rule` supports these built-in rules:

| Rule | Effect |
|------|--------|
| `ensure_trailing_period` | Add a period if the content doesn't already end with `.`, `!`, or `?` |
| `remove_trailing_period` | Remove a trailing period |
| `title_case` | Convert to Title Case (preserves LaTeX commands and math) |
| `sentence_case` | Convert to Sentence case (preserves LaTeX commands and math) |
| `uppercase` | Convert to UPPERCASE (preserves LaTeX commands and math) |
| `lowercase` | Convert to lowercase (preserves LaTeX commands and math) |

All case rules preserve LaTeX commands (`\LaTeX`, `\textbf{...}`, `\alpha`, etc.) and inline math (`$...$`) verbatim -- only plain text segments are transformed.

### Consistency checks

`consistency_report` currently supports:

- **labels** -- finds `\label{}` tags with no matching `\ref{}` and vice versa
- **notation** -- finds duplicate `\newcommand` definitions

## Setup

### Prerequisites

- Node.js 18+
- An Overleaf account with Git integration enabled (requires a paid plan or institutional access)

### Get your Overleaf credentials

1. **Project ID** -- from your Overleaf project URL:
   ```
   https://www.overleaf.com/project/682ab1abcdef1234567890ab
                                      ^^^^^^^^^^^^^^^^^^^^^^^^
                                      This is your project ID
   ```

2. **Git token** -- go to Account Settings > Git Integration > Create Token. The token looks like `olp_...`.

### Add to Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

### Add to Claude Code

Add to your Claude Code settings (`~/.claude.json`):

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

### Run from source

```bash
git clone https://github.com/jackkfan0305/overleaf-mcp.git
cd overleaf-mcp
npm install
npm run build

# Set credentials
export OVERLEAF_PROJECT_ID="your-project-id"
export OVERLEAF_GIT_TOKEN="olp_yourtoken"

# Run directly
node dist/index.js
```

## Multi-project support

To work with multiple Overleaf projects, create a config file at `~/.config/overleaf-mcp/projects.json`:

```json
{
  "projects": {
    "thesis": {
      "name": "PhD Thesis",
      "projectId": "682ab1abcdef1234567890ab",
      "gitToken": "olp_thesis_token"
    },
    "paper": {
      "name": "NeurIPS 2026 Submission",
      "projectId": "683cd2bcdef12345678901cd",
      "gitToken": "olp_paper_token"
    }
  }
}
```

Then pass `projectName` to any tool:

```
scan_pattern(environment: "caption", projectName: "thesis")
apply_rule(environment: "section", rule: "title_case", projectName: "paper")
```

You can also point to a custom config path with `OVERLEAF_PROJECTS_CONFIG=/path/to/config.json`.

## Architecture

```
src/
├── index.ts              # MCP server entry point, registers all tools
├── config.ts             # Loads project config from env vars or JSON file
├── session.ts            # In-memory store for staged changes (preview before commit)
├── types.ts              # Shared TypeScript interfaces
├── git/
│   ├── client.ts         # Git clone, pull, commit, push via Overleaf's Git bridge
│   └── workspace.ts      # File I/O scoped to the project clone directory
├── latex/
│   ├── parser.ts         # Extracts LaTeX commands/environments from .tex content
│   ├── scanner.ts        # Finds all occurrences of a pattern across project files
│   └── patcher.ts        # Applies transforms and produces unified diffs
└── tools/
    ├── scan.ts           # scan_pattern handler
    ├── apply-rule.ts     # apply_rule handler with built-in transformation rules
    ├── preview.ts        # preview_changes handler
    ├── discard.ts        # discard_changes handler
    ├── commit.ts         # commit_changes handler (write + git push)
    └── consistency.ts    # consistency_report handler
```

### Staged change workflow

Changes are never written to disk until you explicitly call `commit_changes`:

1. `apply_rule` parses `.tex` files and computes transformed content
2. The result is stored in an in-memory `SessionStore`, keyed by project
3. Multiple rules can be composed -- each new `apply_rule` reads from the pending state, not disk
4. `preview_changes` renders the cumulative diff at any point
5. `discard_changes` drops everything without touching files
6. `commit_changes` writes to disk, commits, and pushes -- with automatic rollback if the git commit fails

## Development

```bash
npm install
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run build         # Compile TypeScript to dist/
```

The test suite covers the LaTeX parser, scanner, patcher, all tool handlers, session management, workspace isolation, and server startup.

## Security

- Git tokens are used only during clone/pull/push operations and are immediately removed from the `.git/config` remote URL afterward
- The workspace manager prevents path traversal -- all file operations are scoped to the project clone directory
- No credentials are logged or included in error messages

## License

MIT
