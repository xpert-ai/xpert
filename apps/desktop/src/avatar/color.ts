import defaults from '../../electron/theme-defaults.json'
import type { Bot } from '../types'

export function avatarColorIndex(bot: Pick<Bot, 'id' | 'assistantId'>): number {
  // Stable pseudorandom assignment: keep palette order and hash unchanged across releases.
  // Sidebar copies and catalog/profile entries use the same underlying Assistant identity.
  const identity = bot.assistantId || bot.id
  let hash = 0x811c9dc5
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 0x01000193)
  return (hash >>> 0) % defaults.avatarPalette.length
}

export function assistantAccentColor(bot?: Bot): string | undefined {
  if (!bot) return undefined
  const appearance = bot.avatar?.appearance
  if (appearance?.kind === 'character') return appearance.color
  // ChatKit accepts solid hex accents; avatar backgrounds may also contain CSS gradients.
  if (bot.avatar?.background && /^#[\da-f]{6}$/i.test(bot.avatar.background)) return bot.avatar.background
  if (!bot.avatarUrl && !bot.avatarEmoji) return defaults.avatarPalette[avatarColorIndex(bot)]
  return undefined
}
