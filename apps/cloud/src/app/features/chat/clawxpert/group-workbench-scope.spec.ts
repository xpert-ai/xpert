import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { createGroupWorkbenchScope } from './group-workbench-scope'

const context = { assistantId: 'assistant', conversationId: 'shared-runtime', projectId: null }
function setup() {
  const groupId = signal<string | null>('group-a')
  const identity = signal('user-a:organization-a')
  const ready = signal(true)
  const requests: Subject<typeof context>[] = []
  const api = {
    getContext: jest.fn(() => {
      const response = new Subject<typeof context>()
      requests.push(response)
      return response
    })
  }
  const onError = jest.fn()
  const scope = TestBed.runInInjectionContext(() =>
    createGroupWorkbenchScope({
      groupId,
      identity,
      ready,
      assistantId: () => 'assistant',
      api,
      onError
    })
  )
  TestBed.flushEffects()
  return { groupId, identity, ready, requests, api, onError, scope }
}
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  TestBed.flushEffects()
}
afterEach(() => TestBed.resetTestingModule())

describe('group Workbench runtime scope', () => {
  it('waits for the authorized shared runtime instead of a personal conversation', async () => {
    const h = setup()
    expect(h.scope()).toBeNull()
    h.requests[0].next(context)
    await settle()
    expect(h.scope()).toEqual({ groupId: 'group-a', projectId: null, conversationId: 'shared-runtime' })
  })

  it('invalidates immediately across groups and ignores an old response', async () => {
    const h = setup()
    h.groupId.set('group-b')
    expect(h.scope()).toBeNull()
    TestBed.flushEffects()
    h.requests[0].next(context)
    await settle()
    expect(h.scope()).toBeNull()
    h.requests[1].next({ ...context, conversationId: 'group-b-runtime' })
    await settle()
    expect(h.scope()?.conversationId).toBe('group-b-runtime')
  })

  it('revalidates on identity changes and never falls back after denial', async () => {
    const h = setup()
    h.requests[0].next(context)
    await settle()
    h.identity.set('user-b:organization-a')
    expect(h.scope()).toBeNull()
    TestBed.flushEffects()
    h.requests[1].error(new Error('Forbidden'))
    await settle()
    expect(h.scope()).toBeNull()
    expect(h.onError).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ...context, assistantId: 'different-assistant' },
    { ...context, conversationId: '' }
  ])('rejects an invalid group runtime: %p', async (invalidContext) => {
    const h = setup()
    h.requests[0].next(invalidContext)
    await settle()
    expect(h.scope()).toBeNull()
    expect(h.onError).toHaveBeenCalledTimes(1)
  })

  it('does not request group context for a private chat or while loading', () => {
    const h = setup()
    h.groupId.set(null)
    TestBed.flushEffects()
    expect(h.scope()).toBeNull()
    h.ready.set(false)
    h.groupId.set('group-b')
    TestBed.flushEffects()
    expect(h.api.getContext).toHaveBeenCalledTimes(1)
  })
})
