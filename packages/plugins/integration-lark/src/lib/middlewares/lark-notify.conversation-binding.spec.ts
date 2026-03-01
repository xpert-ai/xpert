import { Command } from '@langchain/langgraph'
import * as langgraph from '@langchain/langgraph'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { LarkNotifyMiddleware, LarkNotifyMiddlewareConfig } from './lark-notify.middleware'

function createBaseConfig(): LarkNotifyMiddlewareConfig {
  return {
    integrationId: 'integration-1',
    recipient_type: 'open_id',
    recipient_id: 'ou_target_1',
    template: {
      enabled: true,
      strict: false
    },
    defaults: {
      postLocale: 'en_us',
      timeoutMs: 1000
    }
  }
}

function mergeConfig(partial: Partial<LarkNotifyMiddlewareConfig> = {}): LarkNotifyMiddlewareConfig {
  const base = createBaseConfig()
  return {
    ...base,
    ...partial,
    template: {
      ...base.template,
      ...(partial.template ?? {})
    },
    defaults: {
      ...base.defaults,
      ...(partial.defaults ?? {})
    }
  }
}

function createContext(overrides: Partial<IAgentMiddlewareContext> = {}): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant-1',
    userId: 'user-ctx-1',
    conversationId: 'conversation-ctx-1',
    xpertId: 'xpert-ctx-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    agentKey: 'agent-1',
    node: {
      key: 'middleware-node'
    } as any,
    tools: new Map(),
    ...overrides
  }
}

async function createFixture(options: {
  config?: Partial<LarkNotifyMiddlewareConfig>
  context?: Partial<IAgentMiddlewareContext>
} = {}) {
  const messageCreate = jest.fn().mockResolvedValue({
    data: {
      message_id: 'msg-1'
    }
  })

  const client = {
    im: {
      message: {
        create: messageCreate,
        patch: jest.fn(),
        delete: jest.fn()
      },
      chat: {
        list: jest.fn()
      }
    },
    contact: {
      v3: {
        user: {
          get: jest.fn(),
          batchGetId: jest.fn(),
          findByDepartment: jest.fn()
        }
      }
    }
  }

  const larkChannel = {
    getOrCreateLarkClientById: jest.fn().mockResolvedValue(client)
  }

  const conversationService = {
    setConversation: jest.fn().mockResolvedValue(undefined)
  }

  const strategy = new LarkNotifyMiddleware(larkChannel as any, conversationService as any)
  const middleware = await Promise.resolve(
    strategy.createMiddleware(mergeConfig(options.config), createContext(options.context))
  )

  return {
    middleware,
    larkChannel,
    conversationService,
    messageCreate
  }
}

function getTool(middleware: any, name: string) {
  const found = middleware.tools.find((tool) => tool.name === name)
  if (!found) {
    throw new Error(`Tool not found: ${name}`)
  }
  return found
}

describe('LarkNotifyMiddleware conversation binding', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({} as any)
  })

  it('binds conversation after sending text to open_id recipient', async () => {
    const { middleware, conversationService } = await createFixture({
      config: {
        recipient_type: 'open_id',
        recipient_id: 'ou_target_1'
      }
    })

    const result = await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'hello'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-1'
        }
      }
    )

    expect(result).toBeInstanceOf(Command)
    expect(conversationService.setConversation).toHaveBeenCalledWith(
      'open_id:ou_target_1',
      'xpert-ctx-1',
      'conversation-ctx-1'
    )
  })

  it('binds conversation after sending rich notification to email recipient', async () => {
    const { middleware, conversationService } = await createFixture({
      config: {
        recipient_type: 'email',
        recipient_id: 'target@example.com'
      }
    })

    await getTool(middleware, 'lark_send_rich_notification').invoke(
      {
        mode: 'post',
        markdown: '## hi'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-2'
        }
      }
    )

    expect(conversationService.setConversation).toHaveBeenCalledWith(
      'email:target@example.com',
      'xpert-ctx-1',
      'conversation-ctx-1'
    )
  })

  it('uses open_id key for open_id recipient and non-open_id key for email recipient', async () => {
    const openIdFixture = await createFixture({
      config: {
        recipient_type: 'open_id',
        recipient_id: 'ou_target_2'
      }
    })
    await getTool(openIdFixture.middleware, 'lark_send_text_notification').invoke(
      { content: 'open-id key' },
      { metadata: { tool_call_id: 'tool-call-2-1' } }
    )

    const emailFixture = await createFixture({
      config: {
        recipient_type: 'email',
        recipient_id: 'target2@example.com'
      }
    })
    await getTool(emailFixture.middleware, 'lark_send_text_notification').invoke(
      { content: 'email key' },
      { metadata: { tool_call_id: 'tool-call-2-2' } }
    )

    expect(openIdFixture.conversationService.setConversation).toHaveBeenCalledWith(
      'open_id:ou_target_2',
      'xpert-ctx-1',
      'conversation-ctx-1'
    )
    expect(emailFixture.conversationService.setConversation).toHaveBeenCalledWith(
      'email:target2@example.com',
      'xpert-ctx-1',
      'conversation-ctx-1'
    )
  })

  it('skips conversation binding for chat_id recipient', async () => {
    const { middleware, conversationService } = await createFixture({
      config: {
        recipient_type: 'chat_id',
        recipient_id: 'oc_chat_1'
      }
    })

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'hello group'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-3'
        }
      }
    )

    expect(conversationService.setConversation).not.toHaveBeenCalled()
  })

  it('skips binding when context conversationId is missing', async () => {
    const { middleware, conversationService } = await createFixture({
      context: {
        conversationId: undefined
      }
    })

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'hello thread only'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-4'
        }
      }
    )

    expect(conversationService.setConversation).not.toHaveBeenCalled()
  })

  it('does not fail send flow when conversation binding throws', async () => {
    const { middleware, conversationService } = await createFixture()
    conversationService.setConversation.mockRejectedValueOnce(new Error('cache down'))

    const result = await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'hello unresolved user'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-5'
        }
      }
    )

    expect(result).toBeInstanceOf(Command)
    expect(conversationService.setConversation).toHaveBeenCalledTimes(1)
    expect(result.update.lark_notify_last_result.successCount).toBe(1)
  })
})
