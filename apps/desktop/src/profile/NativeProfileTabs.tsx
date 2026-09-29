import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, CirclePause, Clock3, LoaderCircle, MessageSquare } from 'lucide-react'
import { invoke } from '../host'
import { Button } from '../ui'
import { t, useLocale } from '../i18n'
import { assistantStatusLabel } from '../assistant-list-model'
import type { AssistantRow } from '../assistant-list-model'
import type { AssistantProfile, ProfileConversation } from '../assistant-profile-types'
import { ProfileError, ProfileLoading } from './ProfileState'

export function ProfileActivity({
  row,
  onSelect
}: {
  row: AssistantRow
  onSelect: (threadId?: string | null) => void
}) {
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState<{ items: ProfileConversation[]; total: number }>()
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    setData(undefined)
    setError('')
    invoke('botConversations', { botId: row.bot.id, page }).then(
      (value) => {
        if (!disposed) setData(value)
      },
      (error: Error) => {
        if (!disposed) setError(error.message)
      }
    )
    return () => {
      disposed = true
    }
  }, [row.bot.id, row.activity?.latestConversationAt, page, retry])
  if (error) return <ProfileError message={error} retry={() => setRetry((value) => value + 1)} />
  if (!data) return <ProfileLoading />
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="mb-2 text-sm font-semibold">{t('Recent activity')}</h3>
      {data.items.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {data.items.map((item) => {
            const Icon =
              item.status === 'busy'
                ? LoaderCircle
                : item.status === 'error'
                  ? CircleAlert
                  : ['paused', 'pausing', 'interrupted'].includes(item.status || '')
                    ? CirclePause
                    : MessageSquare
            return (
              <button
                key={item.id}
                disabled={!item.threadId}
                onClick={() => onSelect(item.threadId)}
                className="flex w-full items-start gap-3 border-b border-border/60 py-3 text-left last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className={`size-4 ${item.status === 'busy' ? 'animate-spin' : ''}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-5">
                    {item.title || t('Untitled conversation')}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t(assistantStatusLabel({ ...row.activity, latestConversationStatus: item.status }))}</span>
                    <time>{profileDate(item.updatedAt, locale)}</time>
                  </span>
                </span>
                <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Clock3 className="size-6" />
          {t('No conversations yet')}
        </div>
      )}
      {data.total > 5 && (
        <div className="mt-2 flex items-center justify-end gap-2 border-t pt-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={page === 1}
            aria-label={t('Previous page')}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            {page} / {Math.ceil(data.total / 5)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={page * 5 >= data.total}
            aria-label={t('Next page')}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
export function profileDate(value: Date | string | null | undefined, locale: string) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        date
      )
    : t('Not available')
}
export const indicatorLabels = ['Skills', 'Tools', 'Sub-agents', 'Conversations · 30d']
export function ProfileDetails({ profile }: { profile: AssistantProfile }) {
  const locale = useLocale()
  return (
    <div className="space-y-4 text-sm">
      <h3 className="font-semibold">{t('About this assistant')}</h3>
      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {profile.description || t('No description yet')}
      </p>
      <dl className="divide-y text-xs">
        {[
          [t('Created by'), profile.creator?.name],
          [t('Workspace'), profile.workspace?.name],
          [t('Version'), profile.version],
          [t('Published'), profileDate(profile.publishedAt, locale)]
        ].map(([label, value]) => (
          <div key={label} className="flex gap-5 py-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="ml-auto truncate text-right">{value || t('Not available')}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t pt-4">
        <h3 className="font-semibold">{t('Assistant capabilities')}</h3>
        <dl className="mt-1 divide-y text-xs">
          {[profile.indicators.skillCount, profile.indicators.toolCount, profile.indicators.subAgentCount].map(
            (value, index) => (
              <div key={indicatorLabels[index]} className="flex justify-between py-3">
                <dt className="text-muted-foreground">{t(indicatorLabels[index])}</dt>
                <dd className="font-medium">{value ?? t('Not available')}</dd>
              </div>
            )
          )}
        </dl>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {t('Capabilities come from the published assistant. Custom views are enabled by its configuration.')}
        </p>
      </div>
    </div>
  )
}
