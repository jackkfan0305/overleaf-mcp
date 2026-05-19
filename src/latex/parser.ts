import type { EnvironmentName, ParsedEnvironment } from '../types.js'

interface LatexCommandMatch {
  command: string
  line: number
  offset: number
  raw: string
  content: string
  contentStart: number
  contentEnd: number
  optionalArgs: string[]
}

const COMMANDS_BY_TYPE: Partial<Record<EnvironmentName, string[]>> = {
  caption: ['caption'],
  section: ['section'],
  subsection: ['subsection'],
  subsubsection: ['subsubsection'],
  label: ['label'],
  ref: ['ref', 'eqref', 'autoref', 'cref', 'Cref'],
  cite: ['cite', 'citep', 'citet', 'citealp', 'citeauthor', 'citeyear', 'parencite', 'textcite'],
  newcommand: ['newcommand', 'renewcommand'],
}

const ENV_PATTERN_SOURCES: Partial<Record<EnvironmentName, string>> = {
  figure:        String.raw`\\begin\{figure\}([\s\S]*?)\\end\{figure\}`,
  table:         String.raw`\\begin\{table\}([\s\S]*?)\\end\{table\}`,
  equation:      String.raw`\\begin\{equation\}([\s\S]*?)\\end\{equation\}`,
  align:         String.raw`\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}`,
  'math-inline':  String.raw`(?<!\$)\$([^$\n]+)\$`,
  'math-display': String.raw`\$\$([\s\S]*?)\$\$`,
}

function envPattern(type: EnvironmentName): RegExp | null {
  const src = ENV_PATTERN_SOURCES[type]
  return src ? new RegExp(src, 'g') : null
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
    const commands = COMMANDS_BY_TYPE[type]
    if (commands) {
      return this.extractCommands(content, file, commands).map(command => ({
        type,
        match: {
          file,
          line: command.line,
          raw: command.raw,
          offset: command.offset,
        },
        content: command.content,
      }))
    }

    const pattern = envPattern(type)
    if (!pattern) throw new Error(`Unknown environment: ${type}`)

    const results: ParsedEnvironment[] = []
    let m: RegExpExecArray | null

    while ((m = pattern.exec(content)) !== null) {
      results.push({
        type,
        match: { file, line: this.lineAt(content, m.index), raw: m[0], offset: m.index },
        content: m[1].trim(),
      })
    }

    return results
  }

  private extractCommands(content: string, file: string, commandNames: string[]): LatexCommandMatch[] {
    const wanted = new Set(commandNames)
    const results: LatexCommandMatch[] = []

    for (let i = 0; i < content.length; i++) {
      const char = content[i]
      if (char === '%') {
        let backslashes = 0
        let j = i - 1
        while (j >= 0 && content[j] === '\\') { backslashes++; j-- }
        if (backslashes % 2 === 0) {
          i = this.skipComment(content, i)
          continue
        }
      }
      if (char !== '\\') continue

      const commandStart = i
      const nameStart = i + 1
      const nameMatch = /^[A-Za-z]+/.exec(content.slice(nameStart))
      if (!nameMatch) continue

      const command = nameMatch[0]
      if (!wanted.has(command)) {
        i = nameStart + command.length - 1
        continue
      }

      let cursor = this.skipWhitespace(content, nameStart + command.length)
      if (content[cursor] === '*') cursor = this.skipWhitespace(content, cursor + 1)
      const optionalArgs: string[] = []
      while (content[cursor] === '[') {
        const optional = this.readBracketArgument(content, cursor, '[', ']')
        if (!optional) break
        optionalArgs.push(optional.content)
        cursor = this.skipWhitespace(content, optional.end + 1)
      }

      const required = this.readBracketArgument(content, cursor, '{', '}')
      if (!required) {
        i = cursor
        continue
      }

      results.push({
        command,
        line: this.lineAt(content, commandStart),
        offset: commandStart,
        raw: content.slice(commandStart, required.end + 1),
        content: required.content,
        contentStart: required.contentStart,
        contentEnd: required.contentEnd,
        optionalArgs,
      })
      i = required.end
    }

    return results
  }

  private readBracketArgument(
    content: string,
    start: number,
    open: '{' | '[',
    close: '}' | ']'
  ): { content: string; contentStart: number; contentEnd: number; end: number } | null {
    if (content[start] !== open) return null

    let depth = 0
    for (let i = start; i < content.length; i++) {
      if (content[i] === '\\') {
        i++
        continue
      }
      if (content[i] === open) depth++
      if (content[i] === close) depth--
      if (depth === 0) {
        return {
          content: content.slice(start + 1, i),
          contentStart: start + 1,
          contentEnd: i,
          end: i,
        }
      }
    }

    return null
  }

  private skipWhitespace(content: string, start: number): number {
    let cursor = start
    while (/\s/.test(content[cursor] ?? '')) cursor++
    return cursor
  }

  private skipComment(content: string, start: number): number {
    const newline = content.indexOf('\n', start)
    return newline === -1 ? content.length : newline
  }
}
