import { useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ArrowUpRight, Layers } from 'lucide-react'
import { ApplicationCardBackground } from '../ApplicationScreenshots'
import { actionLabel, categoryLabel, statusLabel } from '../catalog-labels'
import type { ApplicationItem } from '../catalog-types'
import { t } from '../i18n'

function ApplicationLogo({ icon, large = false }: { icon: ApplicationItem['icon']; large?: boolean }) {
  const [failed, setFailed] = useState('')
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background/70 p-1.5 ring-1 ring-border/60 ${large ? 'size-16 text-4xl' : 'size-10 text-2xl'}`}
    >
      {icon?.type === 'image' && icon.value !== failed ? (
        <img
          src={icon.value}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => setFailed(icon.value)}
        />
      ) : icon?.type === 'emoji' ? (
        icon.value
      ) : (
        <Layers className={large ? 'size-8 text-muted-foreground' : 'size-5 text-muted-foreground'} />
      )}
    </span>
  )
}

function ApplicationCardFallback({ icon }: { icon: ApplicationItem['icon'] }) {
  return (
    <div className="flex size-full items-center justify-center bg-linear-to-br from-muted via-background to-border pb-12">
      <ApplicationLogo icon={icon} large />
    </div>
  )
}

export function ApplicationCard({
  item,
  busy,
  onDetails,
  onUse
}: {
  item: ApplicationItem
  busy: boolean
  onDetails: () => void
  onUse: () => void
}) {
  return (
    <article
      tabIndex={0}
      aria-label={item.name}
      className="group/app relative isolate aspect-video min-h-[calc(2*var(--app-card-padding)+7.75rem+3px)] min-w-0 overflow-hidden rounded-xl border bg-muted outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring [--app-card-padding:calc(var(--desktop-row-padding,10px)+0.25rem)] [--app-card-peek:calc(2*var(--app-card-padding)+2.5rem+1px)] [container-type:size] motion-reduce:transition-none"
    >
      <ApplicationCardBackground screenshots={item.screenshots}>
        <ApplicationCardFallback icon={item.icon} />
      </ApplicationCardBackground>
      <div className="absolute inset-x-0 bottom-0 isolate translate-y-[calc(100%-var(--app-card-peek))] overflow-hidden border-t border-border/40 p-[var(--app-card-padding)] text-foreground transition-transform duration-200 will-change-transform group-hover/app:translate-y-0 group-focus-within/app:translate-y-0 [@media(hover:none)]:translate-y-0 motion-reduce:transition-none">
        {/* Keep the filtered image aligned with the cover while details slide. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 translate-y-[calc(var(--app-card-peek)-100%)] transition-transform duration-200 will-change-transform group-hover/app:translate-y-0 group-focus-within/app:translate-y-0 [@media(hover:none)]:translate-y-0 motion-reduce:transition-none"
        >
          <ApplicationCardBackground screenshots={item.screenshots} blurred>
            <ApplicationCardFallback icon={item.icon} />
          </ApplicationCardBackground>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-muted/30 via-muted/75 to-border/90"
        />
        <div className="flex h-10 items-center gap-[var(--desktop-avatar-gap,10px)]">
          <ApplicationLogo icon={item.icon} />
          <div className="min-w-0 flex-1">
            <h3 className="translate-y-2 text-base leading-5 font-semibold transition-transform duration-200 group-hover/app:translate-y-0 group-focus-within/app:translate-y-0 [@media(hover:none)]:translate-y-0 motion-reduce:transition-none">
              <button
                type="button"
                title={item.name}
                disabled={busy}
                onClick={onDetails}
                className="block w-full truncate text-left outline-none hover:underline focus-visible:underline"
              >
                {item.name}
              </button>
            </h3>
            <p
              className="truncate text-xs leading-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/app:opacity-100 group-focus-within/app:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none"
              title={item.publisher}
            >
              {item.publisher || 'Xpert'}
            </p>
          </div>
          <span
            title={statusLabel(item)}
            className="max-w-[35%] shrink-0 truncate rounded-md bg-background/60 px-2 py-1 text-xs leading-4 text-muted-foreground"
          >
            {statusLabel(item)}
          </span>
        </div>
        <div className="invisible group-hover/app:visible group-focus-within/app:visible [@media(hover:none)]:visible">
          {item.description && (
            <p className="mt-2 line-clamp-2 break-words text-sm leading-5" title={item.description}>
              {item.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <div
              className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground"
              title={item.tags.map(categoryLabel).join(' · ')}
            >
              {item.tags.length > 0 && (
                <span className="truncate rounded-md bg-background/60 px-1.5 py-0.5">
                  {categoryLabel(item.tags[0])}
                </span>
              )}
              {item.tags.length > 1 && <span className="shrink-0">+{item.tags.length - 1}</span>}
            </div>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={onDetails}>
              {t('View details')}
            </Button>
            <Button size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" disabled={busy} onClick={onUse}>
              {actionLabel(item)}
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
