import { getWorkspaceFromRunnable } from './graph'

describe('getWorkspaceFromRunnable', () => {
  it('returns the shared project workspace root for project runs', () => {
    expect(
      getWorkspaceFromRunnable({
        projectId: 'project-1',
        userId: 'user-1',
        thread_id: 'thread-1'
      } as any)
    ).toEqual({
      type: 'project',
      id: ''
    })
  })

  it('returns the shared user workspace root for non-project runs', () => {
    expect(
      getWorkspaceFromRunnable({
        userId: 'user-1',
        thread_id: 'thread-1'
      } as any)
    ).toEqual({
      type: 'user',
      id: ''
    })
  })
})
