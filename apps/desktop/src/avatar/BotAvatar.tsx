import { useState } from 'react'
import { AnimatedAssistantAvatar } from './AnimatedAssistantAvatar'
import { avatarEmoji } from './emoji'
import { avatarColorIndex } from './color'
import type { Bot } from '../types'
import type { AvatarConversationStatus } from './expression'

export function BotAvatar({
  bot,
  size = 'default',
  status
}: {
  bot: Bot
  size?: 'compact' | 'default' | 'large' | 'profile'
  status?: AvatarConversationStatus
}) {
  const [failedUrl, setFailedUrl] = useState('')
  const emoji = avatarEmoji(bot.avatarEmoji)
  const bosi =
    bot.avatar?.appearance?.kind === 'character' && bot.avatar.appearance.id === 'bosi' ? bot.avatar.appearance : null
  const imageUrl = !bosi && bot.avatarUrl && failedUrl !== bot.avatarUrl ? bot.avatarUrl : null
  const fallback = !bosi && !imageUrl && !emoji
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${fallback ? 'overflow-hidden text-[var(--xui-color-avatar-foreground)]' : 'text-accent-foreground'} ${size === 'profile' ? 'size-[72px]' : size === 'compact' ? 'size-10' : size === 'large' ? 'size-14' : 'size-12'}`}
      style={{
        background:
          bot.avatar?.background || (fallback ? `var(--xui-color-avatar-${avatarColorIndex(bot)})` : undefined),
        color: bosi?.color
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-contain" onError={() => setFailedUrl(imageUrl)} />
      ) : emoji ? (
        <span
          aria-hidden="true"
          className={`${size === 'profile' ? 'text-4xl' : size === 'compact' ? 'text-xl' : 'text-2xl'} leading-none`}
        >
          {emoji}
        </span>
      ) : (
        <AnimatedAssistantAvatar status={status} />
      )}
    </span>
  )
}
