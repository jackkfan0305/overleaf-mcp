import { createPatch } from 'diff'
import type { FilePatch, PendingChanges } from './types.js'

export class SessionStore {
  private readonly store = new Map<string, PendingChanges>()

  get(projectName: string): PendingChanges | null {
    return this.store.get(projectName) ?? null
  }

  set(projectName: string, changes: PendingChanges): void {
    this.store.set(projectName, this.normalize(projectName, changes))
  }

  merge(projectName: string, newPatches: FilePatch[], newSummary: string): void {
    const existing = this.store.get(projectName)
    if (!existing) {
      this.store.set(projectName, this.fromPatches(projectName, newPatches, newSummary))
      return
    }

    const patchesByFile = { ...existing.patchesByFile }
    for (const patch of newPatches) {
      const current = patchesByFile[patch.file]
      patchesByFile[patch.file] = current
        ? {
            ...patch,
            original: current.original,
            diff: createPatch(patch.file, current.original, patch.patched, 'original', 'patched'),
          }
        : patch
    }

    this.store.set(projectName, {
      ...existing,
      patches: Object.values(patchesByFile),
      patchesByFile,
      summary: existing.summary ? `${existing.summary}; ${newSummary}` : newSummary,
    })
  }

  getFileContent(projectName: string, file: string, diskContent: string): string {
    return this.store.get(projectName)?.patchesByFile[file]?.patched ?? diskContent
  }

  clear(projectName: string): void {
    this.store.delete(projectName)
  }

  private normalize(projectName: string, changes: PendingChanges): PendingChanges {
    return { ...changes, projectName }
  }

  private fromPatches(projectName: string, patches: FilePatch[], summary: string): PendingChanges {
    const patchesByFile = this.indexByFile(patches)
    return { projectName, patches: Object.values(patchesByFile), patchesByFile, summary }
  }

  private indexByFile(patches: FilePatch[]): Record<string, FilePatch> {
    return Object.fromEntries(patches.map(patch => [patch.file, patch]))
  }
}

/** Singleton for the server process */
export const session = new SessionStore()
