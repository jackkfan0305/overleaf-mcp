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
