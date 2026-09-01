import { IXpertAgent, TXpertGraph } from '../ai'
import { getAgentVarGroup, getWorkspaceFromRunnable } from './graph'

describe('getAgentVarGroup', () => {
  it('exposes agent messages as a dedicated message-list variable', () => {
    const graph: TXpertGraph = {
      nodes: [
        {
          key: 'agent-1',
          type: 'agent',
          position: { x: 0, y: 0 },
          entity: {
            key: 'agent-1',
            name: 'Agent 1'
          } as IXpertAgent
        }
      ],
      connections: []
    }

    const messages = getAgentVarGroup('agent-1', graph).variables.find((variable) => variable.name === 'messages')

    expect(messages?.type).toBe('array[message]')
  })
})

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
