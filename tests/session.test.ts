import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from '../src/session.js'

describe('SessionStore', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('returns null when no pending changes exist', () => {
    expect(store.get('default')).toBeNull()
  })

  it('stores and retrieves pending changes', () => {
    const patch = {
      file: 'main.tex',
      original: 'hello',
      patched: 'hello.',
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-hello\n+hello.',
    }
    store.set('default', {
      projectName: 'default',
      patches: [patch],
      patchesByFile: { 'main.tex': patch },
      summary: 'added period',
    })
    const result = store.get('default')
    expect(result?.patches).toHaveLength(1)
    expect(result?.patchesByFile['main.tex']).toEqual(patch)
    expect(result?.summary).toBe('added period')
  })

  it('clears pending changes for a project', () => {
    store.set('default', { projectName: 'default', patches: [], patchesByFile: {}, summary: '' })
    store.clear('default')
    expect(store.get('default')).toBeNull()
  })

  it('merges new patches into existing pending changes', () => {
    const p1 = { file: 'a.tex', original: 'a', patched: 'A', diff: '' }
    const p2 = { file: 'b.tex', original: 'b', patched: 'B', diff: '' }
    store.set('default', { projectName: 'default', patches: [p1], patchesByFile: { 'a.tex': p1 }, summary: 'first' })
    store.merge('default', [p2], 'second')
    const result = store.get('default')
    expect(result?.patches).toHaveLength(2)
    expect(result?.summary).toBe('first; second')
  })

  it('keeps one pending patch per file when merging repeated edits', () => {
    const first = {
      file: 'main.tex',
      original: '\\caption{a result}',
      patched: '\\caption{a result.}',
      diff: '',
    }
    const second = {
      file: 'main.tex',
      original: '\\caption{a result.}',
      patched: '\\caption{A Result.}',
      diff: '',
    }

    store.merge('default', [first], 'period')
    store.merge('default', [second], 'title case')

    const result = store.get('default')
    expect(result?.patches).toHaveLength(1)
    expect(result?.patchesByFile['main.tex'].original).toBe('\\caption{a result}')
    expect(result?.patchesByFile['main.tex'].patched).toBe('\\caption{A Result.}')
    expect(store.getFileContent('default', 'main.tex', 'disk')).toBe('\\caption{A Result.}')
  })
})
