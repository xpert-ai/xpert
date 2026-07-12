import { WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import {
  registerWorkbenchNavigationOpenCommand,
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET
} from './workbench-navigation-open-client-command'

const context = {
  hostType: 'agent',
  hostId: 'assistant-1',
  viewKey: 'knowledge-workbench',
  manifest: {
    key: 'knowledge-workbench'
  }
} as any

describe('registerWorkbenchNavigationOpenCommand', () => {
  it('navigates to the knowledgebase documents page', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn(async () => true)
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
        knowledgebaseId: 'kb-1'
      },
      context
    )

    expect(navigate).toHaveBeenCalledWith(['/xpert/knowledges', 'kb-1', 'documents'])
    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
      knowledgebaseId: 'kb-1'
    })
  })

  it('rejects missing knowledgebase id', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn()
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'bad_request'
      })
    )
  })

  it('opens a persisted assistant conversation', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn(async () => true)
    const openAssistantConversation = jest.fn(async () => true)
    registerWorkbenchNavigationOpenCommand(registry, { navigate, openAssistantConversation })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: 'conversation-1',
        threadId: 'thread-1',
        executionId: 'execution-1'
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(openAssistantConversation).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      threadId: 'thread-1',
      executionId: 'execution-1'
    })
    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
      conversationId: 'conversation-1',
      threadId: 'thread-1',
      executionId: 'execution-1'
    })
  })

  it('does not fall back to the legacy chat route when the host has no embedded chatkit opener', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn(async () => true)
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: 'conversation-1',
        threadId: 'thread-1'
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      code: 'unsupported',
      message: 'Assistant conversation opening is not available in this host.'
    })
  })

  it('rejects unsupported navigation targets', async () => {
    const registry = new ViewClientCommandRegistry()
    const navigate = jest.fn()
    registerWorkbenchNavigationOpenCommand(registry, { navigate })

    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: 'settings.billing',
        knowledgebaseId: 'kb-1'
      },
      context
    )

    expect(navigate).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'unsupported_target'
      })
    )
  })
})
