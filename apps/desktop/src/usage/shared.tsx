import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Button } from '../ui'
import { HostError } from '../host'
import { getLocale, t } from '../i18n'

export function useUsageResource<T>(key: string, load: () => Promise<T>) {
  const loader = useRef(load)
  loader.current = load
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key: '' })
  useEffect(() => {
    let active = true
    void loader.current().then(
      (data) => {
        if (active) setState({ key, data })
      },
      (error: unknown) => {
        if (active) setState({ key, error: error instanceof Error ? error : new Error(t('Could not load usage.')) })
      }
    )
    return () => {
      active = false
    }
  }, [key])
  return state.key === key
    ? { data: state.data, error: state.error, loading: false }
    : { loading: true, data: undefined, error: undefined }
}

export function UsageState({
  loading,
  error,
  onRetry,
  children
}: {
  loading: boolean
  error?: Error
  onRetry: () => void
  children: ReactNode
}) {
  if (loading)
    return (
      <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        {t('Loading usage…')}
      </div>
    )
  if (error) {
    const status = error instanceof HostError ? error.status : undefined
    const message =
      error instanceof HostError && error.key === 'Unsupported operation.'
        ? t('Restart the desktop app to load the updated usage feature.')
        : status === 403
          ? t('Usage is not available for this account in the current organization.')
          : status === 404
            ? t('This service does not provide usage information yet.')
            : status === 401
              ? t('Please sign in again to view usage.')
              : error.message
    return (
      <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm">
        <AlertCircle className="size-5 text-muted-foreground" />
        <p>{message}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  return children
}

export const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits
      }).format(value)
export function formatDate(value: string | null | undefined, time = false, utc = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(utc ? { timeZone: 'UTC' } : {}),
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date)
}
export function periodStatus(value: string | null) {
  const labels: { [key: string]: string } = {
    active: 'Active',
    scheduled: 'Upcoming',
    completed: 'Ended',
    cancelled: 'Cancelled',
    refund_pending: 'Refund pending',
    paused: 'Paused',
    expired: 'Expired'
  }
  return value && labels[value] ? t(labels[value]) : t('Unknown status')
}
export const summaryTitle = (value: { conversationTitle: string | null; assistantTitle: string | null }) =>
  value.conversationTitle || value.assistantTitle || t('Unattributed usage')

export function RangeControl({ days, onChange }: { days: 7 | 30; onChange: (days: 7 | 30) => void }) {
  return (
    <div role="group" aria-label={t('Usage date range')} className="inline-flex shrink-0 rounded-xl bg-muted p-1">
      {([7, 30] as const).map((value) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          aria-pressed={days === value}
          className={`h-8 px-4 text-sm ${days === value ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          onClick={() => onChange(value)}
        >
          {t('{{days}} days', { days: value })}
        </Button>
      ))}
    </div>
  )
}

export function usageRange(days: 7 | 30, now = new Date()) {
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - days + 1)
  start.setUTCHours(0, 0, 0, 0)
  return { start: start.toISOString(), end: now.toISOString() }
}
