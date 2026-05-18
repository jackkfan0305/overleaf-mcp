import { simpleGit, type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'
import type { ProjectConfig } from '../types.js'

export class GitClient {
  private readonly git: SimpleGit
  private readonly authRemoteUrl: string
  private readonly publicRemoteUrl: string

  constructor(private readonly config: ProjectConfig) {
    this.git = simpleGit(config.localPath)
    this.authRemoteUrl =
      `https://git:${config.gitToken}@git.overleaf.com/${config.projectId}`
    this.publicRemoteUrl = `https://git.overleaf.com/${config.projectId}`
  }

  async ensureCloned(): Promise<void> {
    if (!fs.existsSync(this.config.localPath)) {
      await this.clone()
      return
    }

    const gitDir = path.join(this.config.localPath, '.git')
    if (!fs.existsSync(gitDir)) {
      const entries = fs.readdirSync(this.config.localPath)
      if (entries.length === 0) {
        await this.clone()
        return
      }
      throw new Error(`${this.config.localPath} exists but is not a git repository`)
    }

    await this.withAuthRemote(() => this.git.pull('origin', 'master'))
  }

  async commitAndPush(files: string[], message: string): Promise<void> {
    await this.git.add(files)
    await this.git.commit(message)
    await this.withAuthRemote(() => this.git.push('origin', 'master'))
  }

  private async clone(): Promise<void> {
    fs.mkdirSync(path.dirname(this.config.localPath), { recursive: true })
    await simpleGit().clone(this.authRemoteUrl, this.config.localPath)
    await this.sanitizeRemote()
  }

  private async withAuthRemote<T>(operation: () => Promise<T>): Promise<T> {
    await this.git.remote(['set-url', 'origin', this.authRemoteUrl])
    try {
      return await operation()
    } finally {
      await this.sanitizeRemote()
    }
  }

  private async sanitizeRemote(): Promise<void> {
    await this.git.remote(['set-url', 'origin', this.publicRemoteUrl])
  }
}
