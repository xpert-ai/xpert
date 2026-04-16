import { TChatRequestHuman } from '@xpert-ai/contracts'
import { stringifyMessageContent } from '@xpert-ai/copilot'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { TPendingFollowUpStateItem } from '../../../shared'
export { readFollowUpClientMessageId } from '../../../shared/agent/persisted-follow-up'

export function readPersistedFollowUpInput(message: ChatMessage): TChatRequestHuman {
    const raw =
        message.thirdPartyMessage &&
        typeof message.thirdPartyMessage === 'object' &&
        'followUpInput' in message.thirdPartyMessage
            ? ((message.thirdPartyMessage as { followUpInput?: TChatRequestHuman }).followUpInput ?? {})
            : {}

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const inputText =
            typeof raw.input === 'string' && raw.input.trim()
                ? raw.input
                : stringifyMessageContent(message.content)
        const files =
            raw.files?.length || !message.attachments?.length
                ? raw.files
                : (message.attachments as unknown as TChatRequestHuman['files'])

        return {
            ...raw,
            ...(inputText ? { input: inputText } : {}),
            ...(files?.length ? { files } : {})
        }
    }

    return {
        input: stringifyMessageContent(message.content),
        ...(message.attachments?.length
            ? {
                  files: message.attachments as unknown as TChatRequestHuman['files']
              }
            : {})
    }
}

export function mergePendingFollowUpHumans(items: TPendingFollowUpStateItem[]): TChatRequestHuman {
    return items.reduce<TChatRequestHuman>((acc, item) => {
        const nextInput = item.human ?? {}
        const inputText = typeof nextInput.input === 'string' ? nextInput.input.trim() : ''
        const files = [...(acc.files ?? []), ...(nextInput.files ?? [])]

        return {
            ...acc,
            ...nextInput,
            ...(inputText
                ? {
                      input: [acc.input, inputText].filter((value): value is string => !!value).join('\n\n')
                  }
                : {}),
            ...(files.length ? { files } : {})
        }
    }, {})
}
