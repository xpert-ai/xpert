import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '../i18n'
import { useReducedMotion } from './AppearancePreview'
import { imageAvatarPresets, type ImageAvatarPreset } from './image-avatar-presets'

export function ImageAvatarPicker({
  selectedSrc,
  onSelect
}: {
  selectedSrc: string
  onSelect: (preset: ImageAvatarPreset) => void
}) {
  const id = useId()
  const viewport = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const node = viewport.current
    if (!node) return
    const left = node.scrollLeft > 1
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1
    setEdges((current) => (current.left === left && current.right === right ? current : { left, right }))
  }, [])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (viewport.current) observer.observe(viewport.current)
    measure()
    return () => observer.disconnect()
  }, [measure])
  const scroll = (direction: -1 | 1) => {
    const node = viewport.current
    node?.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-label={t('Image avatars')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm text-muted-foreground">{t('Image avatars')}</h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('Previous image avatars')}
            aria-controls={id}
            disabled={!edges.left}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('Next image avatars')}
            aria-controls={id}
            disabled={!edges.right}
            onClick={() => scroll(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div
        ref={viewport}
        id={id}
        onScroll={measure}
        className="-mx-1 flex snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(event) => {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = buttons.findIndex((button) => button === document.activeElement)
          if (index < 0) return
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : event.key === 'ArrowRight'
                  ? Math.min(index + 1, buttons.length - 1)
                  : event.key === 'ArrowLeft'
                    ? Math.max(index - 1, 0)
                    : -1
          if (next < 0) return
          event.preventDefault()
          buttons[next]?.focus()
        }}
      >
        {imageAvatarPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-label={t('Image avatar {{number}}', { number: preset.number })}
            aria-pressed={selectedSrc === preset.src}
            className="flex w-20 shrink-0 snap-start flex-col items-center gap-1 rounded-2xl p-1.5 outline-offset-2 transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-primary disabled:opacity-50"
            onClick={() => onSelect(preset)}
          >
            <img src={preset.src} alt="" className="aspect-square w-full object-contain" loading="lazy" />
            <span className="text-[10px] text-muted-foreground">{preset.number}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
