import { useEffect, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import type { TemplateActivity } from '@xpert-ai/contracts'
import { invoke } from '../host'
import { t } from '../i18n'

export function TemplateActivityPanel({ botId, onOpen }: { botId: string; onOpen?: (threadId: string) => void }) {
  const [activity, setActivity] = useState<TemplateActivity | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const result = await invoke('templateActivity', { botId })
        if (active) {
          setActivity(result)
          setError('')
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 15000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [botId])
  return (
    <section className="space-y-3 border-t border-border pt-4" aria-label={t('Routine results')}>
      <h3 className="font-medium">
        {t('Routine results')} {activity?.unread ? ` · ${activity.unread} ${t('Unread')}` : ''}
      </h3>
      {error && <p role="alert">{error}</p>}
      {activity && !activity.items.length && (
        <p className="text-sm text-muted-foreground">{t('No routine results yet.')}</p>
      )}
      {activity?.items.map((item) => (
        <div key={item.id} className="space-y-2 border-b border-border pb-3">
          <p>
            {item.routine} · {t(`Routine result: ${item.status}`)} {item.unread && ` · ${t('Unread')}`}
          </p>
          <p className="text-xs text-muted-foreground">{new Date(item.scheduledAt).toLocaleString()}</p>
          {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}
          <div className="flex gap-2">
            {item.threadId && onOpen && (
              <Button type="button" variant="outline" onClick={() => onOpen(item.threadId!)}>
                {t('Open result')}
              </Button>
            )}
            {item.unread && (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    setActivity(await invoke('readTemplateActivity', { botId, keys: [item.key] }))
                    setError('')
                  } catch (error) {
                    setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
                  }
                }}
              >
                {t('Mark as read')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
