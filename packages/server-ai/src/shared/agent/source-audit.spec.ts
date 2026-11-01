import type { IChatConversation, TChatOptions, TChatSourceAuditOptions } from '@xpert-ai/contracts'
import {
    buildChatConversationSourceAudit,
    buildChatSourceExecutionMetadata,
    normalizeChatSourceAuditOptions
} from './source-audit'

describe('plugin channel source attribution', () => {
    it.each([
        ['telegram', 'telegram', 'telegram'],
        ['example-channel', 'example-channel', 'example-channel'],
        ['feishu', 'lark', 'lark'],
        ['lark', 'lark', 'lark'],
        ['wecom', 'wecom', 'wechat'],
        ['dingtalk', 'dingtalk', 'dingtalk'],
        ['wechat', 'wechat_personal', 'wechat']
    ])('keeps %s conversation and execution attribution compatible', (from, channelType, auditChannelType) => {
        const input: TChatOptions & TChatSourceAuditOptions = {
            from,
            channelType,
            runtimePrincipal: {
                type: 'assistant',
                xpertId: 'assistant-id',
                sourceIntegrationId: 'integration-id'
            }
        }
        const options = normalizeChatSourceAuditOptions({ options: input, messageId: 'handoff-id' })
        const conversation: Pick<IChatConversation, 'from' | 'sourceAudit'> = {
            from: options.from,
            sourceAudit: buildChatConversationSourceAudit(options)
        }

        expect(conversation).toEqual({
            from,
            sourceAudit: { sourceIntegrationId: 'integration-id', channelType: auditChannelType }
        })
        expect(buildChatSourceExecutionMetadata(options)).toEqual(
            expect.objectContaining({
                from,
                channelType: auditChannelType,
                triggerSource: 'integration',
                sourceIntegrationId: 'integration-id',
                runtimePrincipalType: 'assistant',
                runtimePrincipalXpertId: 'assistant-id',
                handoffMessageId: 'handoff-id'
            })
        )
        expect(options.runtimePrincipal).toEqual(input.runtimePrincipal)
    })
})
