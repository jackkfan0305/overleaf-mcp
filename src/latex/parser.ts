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
