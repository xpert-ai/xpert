import defaults from '../../electron/theme-defaults.json'
import type { TAvatar } from '@xpert-ai/contracts'
import type { Bot } from '../types'

export function avatarColorIndex(bot: Pick<Bot, 'id' | 'assistantId'>): number {
  // Stable pseudorandom assignment: keep palette order and hash unchanged across releases.
  // Sidebar copies and catalog/profile entries use the same underlying Assistant identity.
  const identity = bot.assistantId || bot.id
  let hash = 0x811c9dc5
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 0x01000193)
  return (hash >>> 0) % defaults.avatarPalette.length
}

export function configuredAvatarColor(avatar?: TAvatar | null): string | undefined {
  const appearance = avatar?.appearance
  if (appearance?.kind === 'character') return appearance.color
  if (avatar?.background && /^#[\da-f]{6}$/i.test(avatar.background)) return avatar.background
}

export function assistantAccentColor(bot?: Bot): string | undefined {
  if (!bot) return undefined
  const configured = configuredAvatarColor(bot.avatar)
  if (configured) return configured
  if (!bot.avatarUrl && !bot.avatarEmoji) return defaults.avatarPalette[avatarColorIndex(bot)]
  return undefined
}

export function defaultFaceInk(background?: string): string | undefined {
  if (!background || !/^#[\da-f]{6}$/i.test(background)) return undefined
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = parseInt(background.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179 ? '#000000' : '#ffffff'
}
