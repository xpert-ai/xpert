import { useState } from 'react'
import { AnimatedAssistantAvatar } from './AnimatedAssistantAvatar'
import { avatarEmoji } from './emoji'
import { avatarColorIndex, defaultFaceInk } from './color'
import type { Bot } from '../types'
import type { AvatarConversationStatus } from './expression'

export function BotAvatar({
  bot,
  size = 'default',
  status
}: {
  bot: Pick<Bot, 'id' | 'assistantId' | 'avatar' | 'avatarUrl' | 'avatarEmoji'>
  size?: 'compact' | 'default' | 'fill' | 'profile'
  status?: AvatarConversationStatus
}) {
  const [failedUrl, setFailedUrl] = useState('')
  const emoji = avatarEmoji(bot.avatarEmoji)
  const appearance = bot.avatar?.appearance
  const bosi = appearance?.kind === 'character' && appearance.id === 'bosi' ? appearance : null
  const imageUrl = !bosi && bot.avatarUrl && failedUrl !== bot.avatarUrl ? bot.avatarUrl : null
  const fillPhoto = size === 'fill' && (!appearance || appearance.kind === 'image')
  const insetImage = !fillPhoto && !!bot.avatar?.background && appearance?.kind !== 'character'
  const fallback = !bosi && !imageUrl && !emoji
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${imageUrl || fallback ? 'overflow-hidden' : ''} ${fallback ? 'text-[var(--xui-color-avatar-foreground)]' : 'text-accent-foreground'} ${size === 'profile' ? 'size-[72px]' : size === 'compact' ? 'size-10' : size === 'fill' ? 'size-full' : 'size-12'}`}
      style={{
        background:
          bot.avatar?.background || (fallback ? `var(--xui-color-avatar-${avatarColorIndex(bot)})` : undefined),
        color: fallback ? defaultFaceInk(bot.avatar?.background) : bosi?.color
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={`${insetImage ? 'size-[90%]' : 'size-full'} ${fillPhoto ? 'object-cover' : 'object-contain'}`}
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : emoji ? (
        <span
          aria-hidden="true"
          className={`${size === 'profile' ? 'text-4xl' : size === 'compact' ? 'text-xl' : size === 'fill' ? 'text-[length:50cqi]' : 'text-2xl'} leading-none`}
        >
          {emoji}
        </span>
      ) : (
        <AnimatedAssistantAvatar status={status} />
      )}
    </span>
  )
}
