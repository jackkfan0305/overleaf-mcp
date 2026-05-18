import { simpleGit, type SimpleGit } from 'simple-git'
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
