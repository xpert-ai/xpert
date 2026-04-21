import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { TPendingFollowUpStateItem } from '../../../shared'
import {
    mergeFollowUpHumanInputs,
    readFollowUpClientMessageId,
    readPersistedFollowUpInput
} from '../../../shared/agent/persisted-follow-up'

export { readFollowUpClientMessageId, readPersistedFollowUpInput }

export function mergePendingFollowUpHumans(items: TPendingFollowUpStateItem[]) {
    return mergeFollowUpHumanInputs(items.map((item) => item.human))
}
