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
