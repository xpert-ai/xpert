import { Serializable } from '@langchain/core/load/serializable'
import { I18nObject, IChatMessage, TSensitiveOperation, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { LarkEventRenderItem, LarkRenderItem } from './handoff'
import { translate } from './i18n'
import type { LarkChannelStrategy } from './lark-channel.strategy'
import { ChatLarkContext, LARK_CONFIRM, LARK_END_CONVERSATION, LARK_REJECT, LarkRenderElement, LarkStructuredElement, TLarkConversationStatus } from './types'

export type ChatLarkMessageStatus = IChatMessage['status'] | 'continuing' | 'waiting' | 'done' | TLarkConversationStatus

export interface ChatLarkMessageFields {
  // ID of lark message
  id: string
  // ID of IChatMessage
  messageId: string
  // Status of lark message
  status: ChatLarkMessageStatus
  language: string
  header: any
  elements: LarkRenderElement[]
}

type LarkMessageChannel = Pick<LarkChannelStrategy, 'interactiveMessage' | 'patchInteractiveMessage'>

export class ChatLarkMessage extends Serializable implements ChatLarkMessageFields {
  lc_namespace: string[] = ['lark']
  override lc_serializable = true

  override get lc_attributes() {
    return {
      status: this.status,
      id: this.id,
      messageId: this.messageId,
      header: this.header,
      elements: this.elements,
      language: this.language
    }
  }

  static readonly headerTemplate = 'indigo'
  static readonly logoImgKey = 'img_v3_02v2_ea22de8a-06c9-4e0e-a0da-9e2b22f5de2g'
  static readonly logoIcon = {
    tag: 'custom_icon',
    img_key: ChatLarkMessage.logoImgKey,
    corner_radius: '30%'
  }
  static readonly helpUrl = 'https://docs.xpertai.cn/en/ai/toolset/chatbi-toolset/bot'

  private readonly logger = new Logger(ChatLarkMessage.name)

  // ID of lark message
  public id: string = null
  // private prevStatus: ChatLarkMessageStatus = null
  public status: ChatLarkMessageStatus = 'thinking'
  // ID of IChatMessage
  public messageId: string
  public language: string

  get larkChannel() {
    return this.chatContext.larkChannel
  }

  get integrationId() {
    return this.chatContext.integrationId
  }

  get chatId() {
    return this.chatContext.chatId
  }

  get larkUserId() {
    return this.chatContext.userId
  }

  /**
   * Get Lark sender's open_id for @mention and private message
   */
  get senderOpenId() {
    return this.chatContext.senderOpenId
  }

  public header = null
  public elements: LarkRenderElement[] = []
  set renderItems(value: LarkRenderItem[]) {
    this.elements = this.serializeRenderItems(value)
  }

  constructor(
    private chatContext: ChatLarkContext & { larkChannel: LarkMessageChannel },
    private options: {
      text?: string
    } & Partial<ChatLarkMessageFields>
  ) {
    super(options)
    this.id = options.id
    this.messageId = options.messageId
    this.status = options.status
    this.language = options.language
    this.header = options.header
    this.elements = options.elements ?? []
  }

  async getTitle() {
    const status = await this.translate('integration.Lark.Status_' + this.status, { lng: this.language })
    switch (this.status) {
      case 'thinking':
        return status
      case 'continuing':
        return status
      case 'waiting':
        return status
      case 'interrupted':
        return status
      default:
        return ''
    }
  }

  getSubtitle() {
    return this.options.text
  }

  async getHeader() {
    const title = await this.getTitle()
    const subTitle = this.getSubtitle()
    return title || subTitle
      ? {
          title: {
            tag: 'plain_text',
            content: title
          },
          subtitle: {
            tag: 'plain_text',
            content: subTitle
          },
          template: ChatLarkMessage.headerTemplate,
          ud_icon: {
            token: 'myai_colorful',
            style: {
              color: 'red'
            }
          }
        }
      : null
  }

  async getCard() {
    const elements = [...this.elements]

    if (this.shouldShowThinkingFooter()) {
      elements.push(await this.getThinkingFooter())
    }

    if (['end', 'error'].includes(this.status)) {
      if (elements[elements.length - 1]?.tag !== 'hr') {
        elements.push({ tag: 'hr' })
      }
      elements.push({
        tag: 'markdown',
        content: await this.translate('integration.Lark.ConversationEnded', { lng: this.language })
      })
    } else if (this.status !== 'done') {
      if (elements[elements.length - 1]?.tag !== 'hr') {
        elements.push({ tag: 'hr' })
      }
      elements.push(await this.getEndAction())
    }

    return {
      elements
    }
  }

  private shouldShowThinkingFooter(): boolean {
    return (
      this.status !== 'end' &&
      this.status !== 'done' &&
      this.status !== XpertAgentExecutionStatusEnum.SUCCESS &&
      this.status !== XpertAgentExecutionStatusEnum.ERROR &&
      this.status !== XpertAgentExecutionStatusEnum.INTERRUPTED
    )
  }

  private async getThinkingFooter() {
    const thinking = await this.translate('integration.Lark.Status_thinking', { lng: this.language })
    return {
      tag: 'markdown',
      content: `<text_tag color='wathet'>${thinking}</text_tag>`
    }
  }

  async getEndAction() {
    return {
      tag: 'action',
      layout: 'default',
      actions: [
        ...(this.status === 'interrupted' ? await this.getInterruptedActions() : []),
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: await this.translate('integration.Lark.EndConversation', { lng: this.language })
          },
          type: 'text',
          complex_interaction: true,
          width: 'default',
          size: 'medium',
          value: LARK_END_CONVERSATION
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: await this.translate('integration.Lark.HelpDoc', { lng: this.language })
          },
          type: 'text',
          complex_interaction: true,
          width: 'default',
          size: 'medium',
          multi_url: {
            url: ChatLarkMessage.helpUrl
          }
        }
      ]
    }
  }

  async getInterruptedActions() {
    return [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: await this.translate('integration.Lark.Confirm', { lng: this.language })
        },
        type: 'primary',
        width: 'default',
        size: 'medium',
        value: LARK_CONFIRM
      },
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: await this.translate('integration.Lark.Reject', { lng: this.language })
        },
        type: 'danger',
        width: 'default',
        size: 'medium',
        value: LARK_REJECT
      }
    ]
  }

  /**
   * Complete this message and a new message will be opened
   */
  async done() {
    await this.update({ status: 'done' })
  }

  /**
   * Ending a Session (Conversation)
   */
  async end() {
    await this.update({ status: 'end' })
  }

  /**
   * Reply to error message
   *
   * @param message Error message
   */
  async error(message: string) {
    await this.update({
      status: XpertAgentExecutionStatusEnum.ERROR,
      elements: [
        {
          tag: 'markdown',
          content: message
        }
      ]
    })
  }

  async update(options?: {
    status?: ChatLarkMessageStatus
    elements?: LarkRenderElement[]
    header?: any
    language?: string
    action?: (action) => void
  }) {
    if (options?.language) {
      this.language = options.language
    }
    if (options?.status) {
      this.status = options.status
    }
    if (options?.elements) {
      this.elements.push(...options.elements)
    }
    if (options?.header) {
      this.header = options.header
    }

    const elements = await this.getCard()
    if (this.id) {
      try {
        await this.larkChannel.patchInteractiveMessage(this.chatContext.integrationId, this.id, {
          ...elements,
          header: this.header ?? (await this.getHeader())
        })
      } catch (err) {
        console.error(err)
      }
    } else {
      const result = await this.larkChannel.interactiveMessage(this.chatContext, {
        ...elements,
        header: this.header ?? (await this.getHeader())
      })

      this.id = result.data.message_id
    }
  }

  async confirm(operation: TSensitiveOperation) {
    await this.update({
      status: 'interrupted',
      elements: createConfirmMessage(operation),
      action: (action) => {
        console.log(action)
      }
    })
  }

  async translate(key: string, options?: Parameters<typeof translate>[1]) {
    return translate(key, options)
  }

  private serializeRenderItems(items: readonly LarkRenderItem[] | undefined): LarkRenderElement[] {
    const elements: LarkRenderElement[] = []
    for (const item of items ?? []) {
      const element = this.serializeRenderItem(item)
      if (element) {
        elements.push(element)
      }
    }
    return elements
  }

  private serializeRenderItem(item: LarkRenderItem): LarkRenderElement | null {
    switch (item.kind) {
      case 'stream_text':
        return {
          tag: 'markdown',
          content: item.text
        }
      case 'event':
        return {
          tag: 'markdown',
          content: this.serializeEventContent(item)
        }
      case 'structured':
        return cloneStructuredElement(item.element)
      default:
        return null
    }
  }

  private serializeEventContent(item: LarkEventRenderItem): string {
    const lines: string[] = []
    if (item.eventType) {
      lines.push(`**Event:** ${item.eventType}`)
    }
    if (item.tool) {
      lines.push(`**Tool:** ${item.tool}`)
    }
    if (item.title) {
      lines.push(`**Title:** ${item.title}`)
    }
    if (item.message) {
      lines.push(item.message)
    }
    if (item.status) {
      lines.push(`**Status:** ${item.status}`)
    }
    if (item.error) {
      lines.push(`**Error:** ${item.error}`)
    }
    return lines.join('\n')
  }

}

// Construct Lark message card
function createConfirmMessage(operation: TSensitiveOperation) {
  // Helper: handle multi-language or default value
  const resolveI18n = (i18n: I18nObject | string): string =>
    typeof i18n === 'string' ? i18n : i18n?.zh_Hans || i18n?.en_US || ''

  const toolElements = operation.tasks?.map((toolCall, index) => {
    const { call, parameters } = toolCall
    const paramsElements = []
    parameters?.map((param) => {
      paramsElements.push({
        tag: 'markdown',
        content: `**${resolveI18n(param.title || param.name)}** <text_tag color='turquoise'>${param.name}</text_tag>: ${call.args[param.name]}`
      })
    })

    return [
      {
        tag: 'markdown',
        content: `**${toolCall.info.title || toolCall.info.name}**: *${toolCall.info.description}*`
      },
      ...paramsElements
    ]
  })

  return [
    ...toolElements.flat(),
    {
      tag: 'hr',
      margin: '0px 0px 10px 0px'
    }
  ]
}

export function cloneStructuredElement<T extends LarkStructuredElement>(element: T): T {
    if (element && typeof element === 'object') {
      return { ...(element as Record<string, unknown>) } as T
    }
    return element
  }
