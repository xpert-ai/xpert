import { useState } from 'react'
import { AnimatedAssistantAvatar } from './AnimatedAssistantAvatar'
import { avatarEmoji } from './emoji'
import { avatarColorIndex } from './color'
import type { Bot } from '../types'

export function BotAvatar({ bot, size = 'default' }: { bot: Bot; size?: 'compact' | 'default' | 'large' | 'profile' }) {
  const [failedUrl, setFailedUrl] = useState('')
  const emoji = avatarEmoji(bot.avatarEmoji)
  const imageUrl = bot.avatarUrl && failedUrl !== bot.avatarUrl ? bot.avatarUrl : null
  const fallback = !imageUrl && !emoji
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${fallback ? 'rounded-lg text-[var(--xui-color-avatar-foreground)]' : 'rounded-full bg-primary/10 text-accent-foreground'} ${size === 'profile' ? 'size-[72px]' : size === 'compact' ? 'size-10' : size === 'large' ? 'size-14' : 'size-12'}`}
      style={fallback ? { backgroundColor: `var(--xui-color-avatar-${avatarColorIndex(bot)})` } : undefined}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" onError={() => setFailedUrl(imageUrl)} />
      ) : emoji ? (
        <span
          aria-hidden="true"
          className={`${size === 'profile' ? 'text-4xl' : size === 'compact' ? 'text-xl' : 'text-2xl'} leading-none`}
        >
          {emoji}
        </span>
      ) : (
        <AnimatedAssistantAvatar />
      )}
    </span>
  )
}
