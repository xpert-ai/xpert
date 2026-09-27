import type { ComponentProps } from 'react'
import { CircleAlert, CirclePause, Clock3, LoaderCircle } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@xpert-ai/shadcn-ui'
import { BotAvatar } from './BotAvatar'
import { assistantStatusLabel, type AssistantRow } from './assistant-list-model'
import { t, useLocale } from './i18n'

export function AssistantPreview({
  row,
  children
}: {
  row: AssistantRow
  children: ComponentProps<typeof HoverCardTrigger>['children']
}) {
  const locale = useLocale()
  const status = row.activity?.latestConversationStatus
  const date = row.activity?.latestConversationAt ? new Date(row.activity.latestConversationAt) : null
  const validDate = date && Number.isFinite(date.getTime()) ? date : null
  const title = row.activity?.latestConversationTitle?.trim()
  const Icon =
    status === 'busy'
      ? LoaderCircle
      : status === 'error'
        ? CircleAlert
        : status === 'paused' || status === 'pausing' || status === 'interrupted'
          ? CirclePause
          : Clock3
  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="center"
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-96px)] text-sm"
      >
        <div className="flex items-center gap-2.5">
          <BotAvatar bot={row.bot} size="compact" />
          <span className="min-w-0 flex-1 truncate font-semibold">{row.bot.name}</span>
          {validDate && (
            <time
              dateTime={validDate.toISOString()}
              title={validDate.toLocaleString(locale)}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {new Intl.DateTimeFormat(locale, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }).format(validDate)}
            </time>
          )}
        </div>
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          <Icon className={`size-3.5 ${status === 'busy' ? 'animate-spin' : ''}`} />
          <span>{t(assistantStatusLabel(row.activity))}</span>
          {row.unread && <span className="ml-auto text-primary">{t('Unread')}</span>}
        </div>
        <p className="mt-2 line-clamp-2 break-words leading-5">
          {title || t(row.activity?.latestConversationId ? 'Untitled conversation' : 'No conversations yet')}
        </p>
      </HoverCardContent>
    </HoverCard>
  )
}
