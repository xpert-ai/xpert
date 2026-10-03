import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, createResourceCardContent, type ConversationResourceCard } from '@xpert-ai/contracts'
import { emitResourceCard } from './resource-card'
import { emitResourceCard as emitPublicResourceCard } from '../resource-card'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))

describe('resource card event bridge', () => {
  it('emits the existing ChatKit envelope with the active runnable configuration', async () => {
    const card: ConversationResourceCard = {
      resource: { namespace: 'plugin', type: 'report', id: 'report' },
      title: 'Report',
      open: { target: 'workbench.view', viewKey: 'plugin__reports', selectionId: 'report' }
    }
    const config = { tags: ['current-tool'] }
    await emitResourceCard(card, config)
    expect(emitResourceCard).toBe(emitPublicResourceCard)
    expect(dispatchCustomEvent).toHaveBeenCalledWith(
      ChatMessageEventTypeEnum.ON_CHAT_EVENT,
      createResourceCardContent(card),
      config
    )
  })
})
