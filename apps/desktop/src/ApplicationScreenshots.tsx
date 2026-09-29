import { useId, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { t } from './i18n'

export function ApplicationCardBackground({ screenshots }: { screenshots: string[] }) {
  const [failed, setFailed] = useState<string[]>([])
  const source = screenshots.find((url) => !failed.includes(url))
  if (!source) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <img
        key={source}
        src={source}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full scale-105 object-cover blur-[2px]"
        onError={() => setFailed((urls) => [...urls, source])}
      />
      <div className="absolute inset-0 bg-linear-to-r from-background/95 via-background/85 to-background/65" />
    </div>
  )
}

export function ApplicationScreenshots({ name, screenshots }: { name: string; screenshots: string[] }) {
  const slideId = useId()
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState<string[]>([])
  const index = Math.max(0, screenshots.indexOf(selected))
  const source = screenshots[index]
  if (!source) return null
  const select = (next: number) => {
    if (next >= 0 && next < screenshots.length) setSelected(screenshots[next])
  }
  const label = t('Screenshot {{current}} of {{total}}', { current: index + 1, total: screenshots.length })
  return (
    <section
      role="region"
      aria-label={t('App screenshots')}
      aria-roledescription={t('carousel')}
      tabIndex={0}
      className="space-y-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        select(index + (event.key === 'ArrowRight' ? 1 : -1))
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t('App screenshots')}</h3>
        <span aria-live="polite" aria-atomic="true" className="text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        id={slideId}
        role="group"
        aria-roledescription={t('slide')}
        aria-label={label}
        className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
      >
        {failed.includes(source) ? (
          <div role="status" className="flex flex-col items-center gap-3 p-4 text-sm text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
            <p>{t('Could not load screenshot.')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFailed((urls) => urls.filter((url) => url !== source))}
            >
              {t('Retry')}
            </Button>
          </div>
        ) : (
          <img
            key={source}
            src={source}
            alt={t('{{name}} screenshot {{number}}', { name, number: index + 1 })}
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-contain"
            onError={() => setFailed((urls) => [...urls, source])}
          />
        )}
      </div>
      {screenshots.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('Previous screenshot')}
            aria-controls={slideId}
            disabled={index === 0}
            onClick={() => select(index - 1)}
          >
            <ChevronLeft />
          </Button>
          <div
            className="flex min-w-0 flex-1 flex-wrap justify-center"
            role="group"
            aria-label={t('Choose screenshot')}
          >
            {screenshots.map((url, position) => (
              <button
                key={url}
                type="button"
                aria-label={t('Show screenshot {{number}}', { number: position + 1 })}
                aria-current={position === index ? 'true' : undefined}
                aria-controls={slideId}
                className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => select(position)}
              >
                <span
                  className={`h-1.5 rounded-full ${position === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`}
                />
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('Next screenshot')}
            aria-controls={slideId}
            disabled={index === screenshots.length - 1}
            onClick={() => select(index + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </section>
  )
}
