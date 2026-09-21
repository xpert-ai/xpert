import type { EmojiMartData } from '@emoji-mart/data'
import emojiData from '@emoji-mart/data/sets/15/native.json'
import type { TAvatar } from '@xpert-ai/contracts'

const emojiIndex: Pick<EmojiMartData, 'emojis' | 'aliases'> = emojiData

/** Older templates store Emoji Mart IDs without their Unicode representation. */
export function avatarForChat(avatar?: TAvatar): TAvatar | undefined {
    if (!avatar?.emoji?.id || avatar.emoji.unified) return avatar
    const id = avatar.emoji.id
    const unified = emojiIndex.emojis[emojiIndex.aliases[id] ?? id]?.skins[0]?.unified
    return unified ? { ...avatar, emoji: { ...avatar.emoji, unified } } : avatar
}
