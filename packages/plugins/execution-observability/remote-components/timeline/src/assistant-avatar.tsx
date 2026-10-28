import { Avatar, AvatarFallback, AvatarImage } from '@xpert-ai/shadcn-ui'
import type { ExecutionObservationOverview } from '@xpert-ai/contracts'

export function AssistantAvatar({
  avatar,
  name
}: {
  avatar: ExecutionObservationOverview['assistants'][number]['avatar']
  name: string
}) {
  const unified = avatar?.emoji?.unified
  const points =
    unified && /^[\da-f]+(-[\da-f]+)*$/i.test(unified)
      ? unified.split('-').map((part) => Number.parseInt(part, 16))
      : []
  const emoji = points.length && points.every((point) => point <= 0x10ffff) ? String.fromCodePoint(...points) : null
  return (
    <Avatar className="size-7 shrink-0 rounded-md" title={name} aria-label={name}>
      {avatar?.url && (
        <AvatarImage src={avatar.url} alt={name} loading="lazy" decoding="async" className="object-cover" />
      )}
      <AvatarFallback
        className="rounded-md bg-primary/10 text-xs font-medium text-primary"
        style={avatar?.background ? { backgroundColor: avatar.background } : undefined}
      >
        {emoji ? <span className="text-lg">{emoji}</span> : name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
