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
    store.set('default', { projectName: 'default', patches: [patch], summary: 'added period' })
    const result = store.get('default')
    expect(result?.patches).toHaveLength(1)
    expect(result?.summary).toBe('added period')
  })

  it('clears pending changes for a project', () => {
    store.set('default', { projectName: 'default', patches: [], summary: '' })
    store.clear('default')
    expect(store.get('default')).toBeNull()
  })

  it('merges new patches into existing pending changes', () => {
    const p1 = { file: 'a.tex', original: 'a', patched: 'A', diff: '' }
    const p2 = { file: 'b.tex', original: 'b', patched: 'B', diff: '' }
    store.set('default', { projectName: 'default', patches: [p1], summary: 'first' })
    store.merge('default', [p2], 'second')
    const result = store.get('default')
    expect(result?.patches).toHaveLength(2)
    expect(result?.summary).toBe('first; second')
  })
})
