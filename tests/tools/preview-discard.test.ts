import { describe, it, expect, beforeEach } from 'vitest'
import { handlePreviewChanges } from '../../src/tools/preview.js'
import { handleDiscardChanges } from '../../src/tools/discard.js'
import { SessionStore } from '../../src/session.js'
import type { FilePatch } from '../../src/types.js'

function makePatch(file: string, original: string, patched: string): FilePatch {
  return {
    file,
    original,
    patched,
    diff: `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${original}\n+${patched}`,
  }
}

describe('handlePreviewChanges', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('returns no pending changes when session is empty', () => {
    const result = handlePreviewChanges(store, 'default')
    expect(result.hasPendingChanges).toBe(false)
    expect(result.diff).toBe('')
    expect(result.filesAffected).toHaveLength(0)
  })

  it('returns combined diff and file list when changes exist', () => {
    const p1 = makePatch('main.tex', '\\caption{A}', '\\caption{A.}')
    const p2 = makePatch('ch2.tex', '\\caption{B}', '\\caption{B.}')
    store.merge('default', [p1, p2], 'add periods')

    const result = handlePreviewChanges(store, 'default')
    expect(result.hasPendingChanges).toBe(true)
    expect(result.summary).toBe('add periods')
    expect(result.filesAffected).toContain('main.tex')
    expect(result.filesAffected).toContain('ch2.tex')
    expect(result.diff).toContain('main.tex')
    expect(result.diff).toContain('ch2.tex')
  })

  it('reflects merged summaries from multiple rules', () => {
    const p1 = makePatch('main.tex', 'a', 'b')
    store.merge('default', [p1], 'first rule')
    const p2 = makePatch('ch2.tex', 'c', 'd')
    store.merge('default', [p2], 'second rule')

    const result = handlePreviewChanges(store, 'default')
    expect(result.summary).toContain('first rule')
    expect(result.summary).toContain('second rule')
  })

  it('isolates projects from each other', () => {
    store.merge('proj-a', [makePatch('a.tex', 'x', 'y')], 'a change')

    const resultB = handlePreviewChanges(store, 'proj-b')
    expect(resultB.hasPendingChanges).toBe(false)

    const resultA = handlePreviewChanges(store, 'proj-a')
    expect(resultA.hasPendingChanges).toBe(true)
  })
})

describe('handleDiscardChanges', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('returns zero when nothing to discard', () => {
    const result = handleDiscardChanges(store, 'default')
    expect(result.filesDiscarded).toBe(0)
    expect(result.message).toContain('No pending changes')
  })

  it('clears pending changes and reports count', () => {
    store.merge('default', [
      makePatch('a.tex', 'x', 'y'),
      makePatch('b.tex', 'x', 'y'),
    ], 'some rule')

    const result = handleDiscardChanges(store, 'default')
    expect(result.filesDiscarded).toBe(2)
    expect(result.message).toContain('2')

    // Session should be empty now
    expect(store.get('default')).toBeNull()
  })

  it('only discards the specified project', () => {
    store.merge('proj-a', [makePatch('a.tex', 'x', 'y')], 'a')
    store.merge('proj-b', [makePatch('b.tex', 'x', 'y')], 'b')

    handleDiscardChanges(store, 'proj-a')
    expect(store.get('proj-a')).toBeNull()
    expect(store.get('proj-b')).not.toBeNull()
  })
})
