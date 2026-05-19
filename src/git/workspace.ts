import fs from 'node:fs'
import path from 'node:path'

export class WorkspaceManager {
  constructor(private readonly root: string) {}

  rootPath(): string {
    return this.root
  }

  resolvePath(filePath: string): string {
    const resolved = path.resolve(this.root, filePath)
    const relative = path.relative(this.root, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal detected: ${filePath}`)
    }
    return resolved
  }

  listTexFiles(): string[] {
    return this.walkDir(this.root)
      .filter(f => f.endsWith('.tex'))
      .map(f => path.relative(this.root, f))
  }

  listFilesByExtension(ext: string): string[] {
    return this.walkDir(this.root)
      .filter(f => f.endsWith(ext))
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
