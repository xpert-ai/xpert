import { useState } from 'react'
import { Bot as BotIcon } from 'lucide-react'
import { avatarEmoji } from './avatar'
import type { Bot } from './types'

export function BotAvatar({ bot, size = 'default' }: { bot: Bot; size?: 'compact' | 'default' | 'large' | 'profile' }) {
  const [failedUrl, setFailedUrl] = useState('')
  const emoji = avatarEmoji(bot.avatarEmoji)
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-accent-foreground ${size === 'profile' ? 'size-[72px]' : size === 'compact' ? 'size-10' : size === 'large' ? 'size-14' : 'size-12'}`}
    >
      {bot.avatarUrl && failedUrl !== bot.avatarUrl ? (
        <img
          src={bot.avatarUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(bot.avatarUrl!)}
        />
      ) : emoji ? (
        <span
          aria-hidden="true"
          className={`${size === 'profile' ? 'text-4xl' : size === 'compact' ? 'text-xl' : 'text-2xl'} leading-none`}
        >
          {emoji}
        </span>
      ) : (
        <BotIcon className={size === 'profile' ? 'size-9' : 'size-5'} />
      )}
    </span>
  )
}
