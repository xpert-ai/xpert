import type { ChatGroupMention } from '@xpert-ai/contracts'
import { groupInvalid } from './group.errors'

/** Text is presentation; a valid mention binds an exact span to an authorized member ID. */
export function groupMentionRecipients(
    text: string,
    mentions: ChatGroupMention[],
    members: { id?: string; name: string; active: boolean }[]
) {
    const sorted = [...mentions].sort((a, b) => a.start - b.start)
    let end = 0
    for (const mention of sorted) {
        const member = members.find((member) => member.id === mention.participantId && member.active)
        if (
            !member ||
            mention.start < end ||
            mention.end <= mention.start ||
            mention.end > text.length ||
            text.slice(mention.start, mention.end) !== `@${member.name}` ||
            (mention.start > 0 && !/\s/.test(text[mention.start - 1])) ||
            (mention.end < text.length && !/[\s,，。.!！?？:：;；]/.test(text[mention.end]))
        )
            throw groupInvalid()
        end = mention.end
    }
    for (const match of text.matchAll(/(^|\s)@(?=\S)/g)) {
        const start = match.index + match[1].length
        if (!sorted.some((mention) => mention.start <= start && mention.end > start)) throw groupInvalid()
    }
    const recipients = [...new Set(sorted.map((mention) => mention.participantId))]
    if (recipients.length > 16) throw groupInvalid()
    return recipients
}
