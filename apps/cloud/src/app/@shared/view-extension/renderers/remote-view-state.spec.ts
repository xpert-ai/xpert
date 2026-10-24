import { parseRemoteViewState, remoteViewState } from './remote-view-state'
afterEach(() => sessionStorage.clear())
it('restores state only in the same user, host and project context', () => {
  const identity = ['agent', 'assistant', 'tasks', 'user', { projectId: 'project' }]
  const state = { initialTab: 'pipeline', scrollLeft: 480 }
  remoteViewState(identity, state)
  expect(remoteViewState([...identity])).toEqual(state)
  expect(remoteViewState(['agent', 'assistant', 'tasks', 'other-user', { projectId: 'project' }])).toBeNull()
  expect(remoteViewState(['agent', 'assistant', 'tasks', 'user', { projectId: 'other-project' }])).toBeNull()
})
it('accepts only small scalar UI state and handles invalid persisted values', () => {
  expect(parseRemoteViewState({ nested: { token: 'not-a-scalar' } })).toBeNull()
  expect(parseRemoteViewState({ long: 'a'.repeat(201) })).toBeNull()
  expect(parseRemoteViewState({ scrollTop: Infinity })).toBeNull()
  expect(parseRemoteViewState(Array(50).fill('item'))).toBeNull()
  expect(remoteViewState(['empty'])).toBeNull()
})
