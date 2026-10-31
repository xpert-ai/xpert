import { useId, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import type { Announcement } from '../../../../packages/contracts/src/user-notification.schema'
import { t } from '../i18n'

export function AnnouncementText({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-6">
      {text.split('\n').map((line, index) =>
        /^#{1,3} /.test(line) ? (
          <p key={index} className="font-semibold">
            {line.replace(/^#{1,3} /, '')}
          </p>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {line.replace(/^[-*] /, '• ') || '\u00a0'}
          </p>
        )
      )}
    </div>
  )
}

export function AnnouncementNotice({ item, onClose }: { item: Announcement; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return (
    <section
      data-announcement-notice
      aria-labelledby={`${id}-title`}
      className="pointer-events-auto flex max-h-[calc(100dvh-6rem)] flex-col rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex shrink-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Bell className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="text-xs text-muted-foreground">
            {t('Announcement')}
            {item.severity === 'important' ? ` · ${t('Important')}` : ''}
          </p>
          <h2 id={`${id}-title`} className="mt-1 break-words text-sm font-semibold">
            {item.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={t('Dismiss announcement')}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div
        id={`${id}-body`}
        className={expanded ? 'mt-3 min-h-0 max-h-[40vh] overflow-y-auto overscroll-contain' : 'mt-3'}
      >
        {expanded ? (
          <AnnouncementText text={item.body} />
        ) : (
          <p className="line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
            {item.body}
          </p>
        )}
      </div>
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'Show less' : 'View details')}
        </Button>
        {item.action && (
          <Button variant="outline" asChild>
            <a href={item.action.url} target="_blank" rel="noopener noreferrer">
              {item.action.label}
            </a>
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          {t('Dismiss announcement')}
        </Button>
      </div>
    </section>
  )
}
