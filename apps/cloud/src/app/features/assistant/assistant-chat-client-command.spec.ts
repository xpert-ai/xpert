import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import {
  ViewClientCommandRegistry,
  type ViewClientCommandContext
} from '../../@shared/view-extension/view-client-command-registry.service'
import { registerAssistantChatSendMessageCommand } from './assistant-chat-client-command'

describe('assistant chat client command', () => {
  it('forwards newThread to ChatKit so a workbench action can start a clean conversation atomically', async () => {
    const calls: string[] = []
    const setThreadId = jest.fn(async () => {
      calls.push('reset')
    })
    const sendUserMessage = jest.fn(async () => undefined)
    sendUserMessage.mockImplementation(async () => {
      calls.push('send')
    })
    const registry = new ViewClientCommandRegistry()
    registerAssistantChatSendMessageCommand(registry, {
      getControl: () => ({ setThreadId, sendUserMessage }) as unknown as ChatKitControl
    })

    await registry.execute(
      ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
      {
        text: 'Compare the selected documents',
        newThread: true,
        followUpMode: 'queue',
        clientMessageId: 'document-center:test'
      },
      context
    )

    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Compare the selected documents',
        newThread: true,
        followUpMode: 'queue',
        clientMessageId: 'document-center:test'
      })
    )
    expect(setThreadId).toHaveBeenCalledWith(null)
    expect(calls).toEqual(['reset', 'send'])
  })

  it('keeps ordinary workbench messages in the active conversation', async () => {
    const setThreadId = jest.fn(async () => undefined)
    const sendUserMessage = jest.fn(async () => undefined)
    const registry = new ViewClientCommandRegistry()
    registerAssistantChatSendMessageCommand(registry, {
      getControl: () => ({ setThreadId, sendUserMessage }) as unknown as ChatKitControl
    })

    await registry.execute(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, { text: 'Continue here' }, context)

    expect(setThreadId).not.toHaveBeenCalled()
    expect(sendUserMessage).toHaveBeenCalledWith({ text: 'Continue here' })
  })
})

const context = {
  hostType: 'agent',
  hostId: 'assistant-1',
  viewKey: 'document-center',
  manifest: { key: 'document-center' }
} as ViewClientCommandContext
