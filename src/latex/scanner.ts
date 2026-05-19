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
