import type { EmojiMartData } from '@emoji-mart/data'
import data from '@emoji-mart/data/sets/15/native.json'
import type { Bot } from './types'

const emojiIndex: Pick<EmojiMartData, 'emojis' | 'aliases'> = data

export function avatarEmoji(emoji: Bot['avatarEmoji']): string | null {
  if (!emoji) return null
  if (emoji.unified && /^[\da-f]{1,6}(?:-[\da-f]{1,6})*$/i.test(emoji.unified)) {
    const points = emoji.unified.split('-').map((code) => parseInt(code, 16))
    if (points.length <= 16 && points.every((point) => point <= 0x10ffff && (point < 0xd800 || point > 0xdfff))) {
      return String.fromCodePoint(...points)
    }
  }
  return emojiIndex.emojis[emojiIndex.aliases[emoji.id] ?? emoji.id]?.skins[0]?.native ?? null
}
