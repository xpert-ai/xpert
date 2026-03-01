import { Command } from '@langchain/langgraph'
import * as langgraph from '@langchain/langgraph'
import {
  LarkNotifyMiddleware,
  LarkNotifyMiddlewareConfig
} from './lark-notify.middleware'

function createBaseConfig(): LarkNotifyMiddlewareConfig {
  return {
    integrationId: 'integration-default',
    recipient_type: 'chat_id',
    recipient_id: 'chat-default',
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

function mergeConfig(partial?: Partial<LarkNotifyMiddlewareConfig>): LarkNotifyMiddlewareConfig {
  const base = createBaseConfig()
  if (!partial) {
    return base
  }

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

async function createFixture(config?: Partial<LarkNotifyMiddlewareConfig>) {
  const messageCreate = jest.fn().mockResolvedValue({
    data: {
      message_id: 'msg-default'
    }
  })
  const messagePatch = jest.fn().mockResolvedValue({})
  const messageDelete = jest.fn().mockResolvedValue({})
  const listUsers = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          open_id: 'ou_tom',
          union_id: 'uu_tom',
          user_id: 'user_tom',
          name: 'Tom Jerry',
          email: 'tom@example.com',
          mobile: '13800138000'
        },
        {
          open_id: 'ou_alice',
          union_id: 'uu_alice',
          user_id: 'user_alice',
          name: 'Alice',
          email: 'alice@example.com',
          mobile: '13900139000'
        }
      ],
      page_token: 'next-user-token',
      has_more: true
    }
  })
  const listChats = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          chat_id: 'oc_analytics',
          name: 'Analytics Team',
          description: 'Daily analytics updates'
        },
        {
          chat_id: 'oc_ops',
          name: 'Ops Team',
          description: 'Operations room'
        }
      ],
      page_token: 'next-chat-token',
      has_more: false
    }
  })

  const client = {
    im: {
      message: {
        create: messageCreate,
        patch: messagePatch,
        delete: messageDelete
      },
      chat: {
        list: listChats
      }
    },
    contact: {
      v3: {
        user: {
          findByDepartment: listUsers
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
  const middleware = await Promise.resolve(strategy.createMiddleware(mergeConfig(config), {} as any))

  return {
    middleware,
    larkChannel,
    messageCreate,
    messagePatch,
    messageDelete,
    listUsers,
    listChats,
    conversationService
  }
}

function getTool(middleware: any, name: string) {
  const tool = middleware.tools.find((item) => item.name === name)
  if (!tool) {
    throw new Error(`Tool ${name} not found`)
  }
  return tool
}

describe('LarkNotifyMiddleware', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({} as any)
  })

  it('createMiddleware exposes default tool names', async () => {
    const { middleware } = await createFixture()

    expect(middleware.tools.map((tool) => tool.name)).toEqual([
      'lark_send_text_notification',
      'lark_send_rich_notification',
      'lark_update_message',
      'lark_recall_message',
      'lark_list_users',
      'lark_list_chats'
    ])
  })

  it('uses middleware integration and default recipients even when tool params provide overrides', async () => {
    const { middleware, larkChannel, messageCreate } = await createFixture({
      integrationId: 'integration-from-config',
      recipient_type: 'chat_id',
      recipient_id: 'chat-from-config',
      defaults: {
        postLocale: 'en_us',
        timeoutMs: 1000
      }
    })

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        integrationId: 'integration-from-args',
        recipients: [{ type: 'chat_id', id: 'chat-from-args' }],
        content: 'hello'
      } as any,
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(larkChannel.getOrCreateLarkClientById).toHaveBeenCalledWith('integration-from-config')
    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receive_id: 'chat-from-config'
        })
      })
    )
  })

  it('resolves state paths for integrationId and recipients while rendering template content', async () => {
    const { middleware, messageCreate } = await createFixture({
      integrationId: 'runtime.integrationId',
      recipient_type: 'chat_id',
      recipient_id: 'runtime.chatId',
      defaults: {
        timeoutMs: 1000,
        postLocale: 'en_us'
      }
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        integrationId: 'integration-from-state',
        chatId: 'chat-from-state',
        userName: 'Alice'
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'Hi {{runtime.userName}}'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          receive_id_type: 'chat_id'
        },
        data: expect.objectContaining({
          receive_id: 'chat-from-state'
        })
      })
    )
    const content = JSON.parse(messageCreate.mock.calls[0][0].data.content)
    expect(content.text).toBe('Hi Alice')
  })

  it('resolves default recipient id as state path when id is a variable name', async () => {
    const { middleware, messageCreate } = await createFixture({
      recipient_type: 'chat_id',
      recipient_id: 'runtime.chatId',
      defaults: {
        timeoutMs: 1000,
        postLocale: 'en_us'
      }
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        chatId: 'chat-from-path'
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'path-based recipient'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receive_id: 'chat-from-path'
        })
      })
    )
  })

  it('expands recipient ids when state path resolves to an array', async () => {
    const { middleware, messageCreate } = await createFixture({
      recipient_type: 'chat_id',
      recipient_id: 'runtime.chatIds',
      defaults: {
        timeoutMs: 1000,
        postLocale: 'en_us'
      }
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        chatIds: ['chat-ok', 'chat-failed']
      }
    } as any)

    messageCreate.mockImplementation(({ data }) => {
      if (data.receive_id === 'chat-failed') {
        throw new Error('mock failure')
      }
      return Promise.resolve({
        data: {
          message_id: `msg-${data.receive_id}`
        }
      })
    })

    const result = await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'batch-notify'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledTimes(2)
    expect(result.update.lark_notify_last_result.successCount).toBe(1)
    expect(result.update.lark_notify_last_result.failureCount).toBe(1)
    expect(result.update.lark_notify_last_result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'chat_id:chat-ok', success: true }),
        expect.objectContaining({ target: 'chat_id:chat-failed', success: false })
      ])
    )
  })

  it('falls back to raw recipient id when state path is missing', async () => {
    const { middleware, messageCreate } = await createFixture({
      recipient_type: 'chat_id',
      recipient_id: 'runtime.missingChatId',
      defaults: {
        timeoutMs: 1000,
        postLocale: 'en_us'
      }
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        chatId: 'chat-existing'
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'fallback-recipient'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receive_id: 'runtime.missingChatId'
        })
      })
    )
  })

  it('keeps template placeholders unchanged when template rendering is disabled', async () => {
    const { middleware, messageCreate } = await createFixture({
      template: {
        enabled: false,
        strict: false
      }
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        userName: 'Alice'
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'Hi {{runtime.userName}}'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-template-disabled'
        }
      }
    )

    const content = JSON.parse(messageCreate.mock.calls[0][0].data.content)
    expect(content.text).toBe('Hi {{runtime.userName}}')
  })

  it('renders inline template values with bracket paths/object JSON/null empty string', async () => {
    const { middleware, messageCreate } = await createFixture()

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        userName: 'Alice',
        users: [{ name: 'Tom' }],
        profile: { level: 2 },
        emptyValue: null
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content:
          'user={{runtime.userName}}, first={{runtime.users[0].name}}, profile={{runtime.profile}}, empty={{runtime.emptyValue}}'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-template-inline'
        }
      }
    )

    const content = JSON.parse(messageCreate.mock.calls[0][0].data.content)
    expect(content.text).toBe('user=Alice, first=Tom, profile={"level":2}, empty=')
  })

  it('resolves full-template recipient_id into array recipients', async () => {
    const { middleware, messageCreate } = await createFixture({
      recipient_id: '{{runtime.chatIds}}'
    })

    jest.spyOn(langgraph, 'getCurrentTaskInput').mockReturnValue({
      runtime: {
        chatIds: ['chat-1', 'chat-2']
      }
    } as any)

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'batch-from-template'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-template-recipient-array'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledTimes(2)
    expect(messageCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          receive_id: 'chat-1'
        })
      })
    )
    expect(messageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          receive_id: 'chat-2'
        })
      })
    )
  })

  it('keeps missing inline variable as placeholder in non-strict mode', async () => {
    const { middleware, messageCreate } = await createFixture()

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'Hello {{ runtime.missing }}'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-template-missing-inline'
        }
      }
    )

    const content = JSON.parse(messageCreate.mock.calls[0][0].data.content)
    expect(content.text).toBe('Hello {{runtime.missing}}')
  })

  it('keeps full missing variable untouched in non-strict mode', async () => {
    const { middleware, messageCreate } = await createFixture()

    await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: '{{ runtime.missing }}'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-template-missing-full'
        }
      }
    )

    const content = JSON.parse(messageCreate.mock.calls[0][0].data.content)
    expect(content.text).toBe('{{ runtime.missing }}')
  })

  it('throws when template variable is missing in strict mode', async () => {
    const { middleware } = await createFixture({
      template: {
        enabled: true,
        strict: true
      }
    })

    await expect(
      getTool(middleware, 'lark_send_text_notification').invoke(
        {
          content: 'Hello {{runtime.missing}}'
        },
        {
          metadata: {
            tool_call_id: 'tool-call-template-strict'
          }
        }
      )
    ).rejects.toThrow("Template variable 'runtime.missing' is not found in current state")
  })

  it('sends text notification and writes state fields', async () => {
    const { middleware, messageCreate } = await createFixture()

    const result = await getTool(middleware, 'lark_send_text_notification').invoke(
      {
        content: 'text-notify'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(result).toBeInstanceOf(Command)
    expect(messageCreate).toHaveBeenCalledTimes(1)
    expect(result.update.lark_notify_last_result.successCount).toBe(1)
    expect(result.update.lark_notify_last_result.failureCount).toBe(0)
    expect(result.update.lark_notify_last_message_ids).toEqual(['msg-default'])
  })

  it('sends rich notification in post mode', async () => {
    const { middleware, messageCreate } = await createFixture()

    await getTool(middleware, 'lark_send_rich_notification').invoke(
      {
        mode: 'post',
        locale: 'zh_cn',
        markdown: '## hello'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledTimes(1)
    const payload = messageCreate.mock.calls[0][0]
    expect(payload.data.msg_type).toBe('post')
    const content = JSON.parse(payload.data.content)
    expect(content.zh_cn.content[0][0].text).toBe('## hello')
  })

  it('sends rich notification in interactive mode', async () => {
    const { middleware, messageCreate } = await createFixture()
    const card = {
      elements: [{ tag: 'markdown', content: 'interactive body' }]
    }

    await getTool(middleware, 'lark_send_rich_notification').invoke(
      {
        mode: 'interactive',
        card
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(messageCreate).toHaveBeenCalledTimes(1)
    const payload = messageCreate.mock.calls[0][0]
    expect(payload.data.msg_type).toBe('interactive')
    expect(JSON.parse(payload.data.content)).toEqual(card)
  })

  it('updates message via patch API', async () => {
    const { middleware, messagePatch } = await createFixture()

    const result = await getTool(middleware, 'lark_update_message').invoke(
      {
        messageId: 'om_update_1',
        mode: 'text',
        content: 'updated content'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(result).toBeInstanceOf(Command)
    expect(messagePatch).toHaveBeenCalledWith({
      path: { message_id: 'om_update_1' },
      data: { content: JSON.stringify({ text: 'updated content' }) }
    })
  })

  it('recalls message via delete API', async () => {
    const { middleware, messageDelete } = await createFixture()

    const result = await getTool(middleware, 'lark_recall_message').invoke(
      {
        messageId: 'om_recall_1'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-id'
        }
      }
    )

    expect(result).toBeInstanceOf(Command)
    expect(messageDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { message_id: 'om_recall_1' }
      })
    )
  })

  it('lists users and chats with pagination and keyword filter', async () => {
    const { middleware, listUsers, listChats } = await createFixture()

    const usersResult = await getTool(middleware, 'lark_list_users').invoke(
      {
        keyword: 'tom',
        pageSize: 50,
        pageToken: 'token-u'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-users'
        }
      }
    )

    const chatsResult = await getTool(middleware, 'lark_list_chats').invoke(
      {
        keyword: 'analytics',
        pageSize: 50,
        pageToken: 'token-c'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-chats'
        }
      }
    )

    expect(listUsers).toHaveBeenCalledWith({
      params: {
        user_id_type: 'open_id',
        department_id_type: 'open_department_id',
        department_id: '0',
        page_size: 50,
        page_token: 'token-u'
      }
    })
    expect(listChats).toHaveBeenCalledWith({
      params: {
        page_size: 50,
        page_token: 'token-c'
      }
    })

    expect(usersResult.update.lark_notify_last_result.data).toEqual(
      expect.objectContaining({
        hasMore: true,
        pageToken: 'next-user-token',
        items: [expect.objectContaining({ name: 'Tom Jerry' })]
      })
    )

    expect(chatsResult.update.lark_notify_last_result.data).toEqual(
      expect.objectContaining({
        hasMore: false,
        pageToken: 'next-chat-token',
        items: [expect.objectContaining({ name: 'Analytics Team' })]
      })
    )
  })

  it('throws clear errors when integration or recipients is missing', async () => {
    const noIntegration = await createFixture({
      integrationId: null,
      recipient_type: 'chat_id',
      recipient_id: 'chat-1',
      defaults: {
        postLocale: 'en_us',
        timeoutMs: 1000
      }
    })

    await expect(
      getTool(noIntegration.middleware, 'lark_send_text_notification').invoke({
        content: 'no integration'
      })
    ).rejects.toThrow('integrationId is required')

    const noRecipients = await createFixture({
      recipient_id: '   ',
      defaults: {
        postLocale: 'en_us',
        timeoutMs: 1000
      }
    })

    await expect(
      getTool(noRecipients.middleware, 'lark_send_text_notification').invoke({
        content: 'no recipients'
      })
    ).rejects.toThrow('recipients is required')
  })
})
