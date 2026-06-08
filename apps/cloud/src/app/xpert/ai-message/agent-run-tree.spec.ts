import { XpertAgentExecutionStatusEnum } from '../../@core'
import { TCopilotChatMessage } from '../types'
import { buildAgentRunRenderTree } from './agent-run-tree'

describe('buildAgentRunRenderTree', () => {
  it('uses persisted agent runs from history-loaded messages', () => {
    const message: TCopilotChatMessage = {
      id: 'message-1',
      role: 'ai',
      content: [
        {
          type: 'text',
          text: 'Processed file',
          executionId: 'child-execution',
          parentExecutionId: 'root-execution'
        }
      ],
      executionId: 'root-execution',
      agentRuns: [
        {
          id: 'root-execution',
          title: 'Batch Scheduler',
          status: XpertAgentExecutionStatusEnum.SUCCESS
        },
        {
          id: 'child-execution',
          parentId: 'root-execution',
          parentExecutionId: 'root-execution',
          agentKey: 'Agent_single_file',
          title: 'Single File Agent',
          status: XpertAgentExecutionStatusEnum.SUCCESS
        }
      ]
    }

    const tree = buildAgentRunRenderTree(message)
    const child = tree.units.find((unit) => unit.type === 'agent' && unit.node.id === 'child-execution')

    expect(child).toMatchObject({
      type: 'agent',
      node: {
        info: {
          title: 'Single File Agent',
          status: XpertAgentExecutionStatusEnum.SUCCESS
        }
      }
    })
  })
})
