import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { t } from '../i18n'
import { useReducedMotion } from './AppearancePreview'

/** Visual radios keep keyboard selection and the large preview in sync. */
export function VisualChoices<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
  className = 'flex flex-wrap gap-2',
  itemClassName = '',
  showLabels = true,
  itemStyle
}: {
  label: string
  value: T | undefined
  options: readonly { id: T; label: string }[]
  onChange: (id: T) => void
  render: (id: T, animate: boolean) => ReactNode
  className?: string
  itemClassName?: string
  showLabels?: boolean
  itemStyle?: (index: number) => CSSProperties
}) {
  const group = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<T>()
  const reduced = useReducedMotion()
  return (
    <div ref={group} role="radiogroup" aria-label={t(label)} className={className}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-label={t(option.label)}
          aria-checked={value === option.id}
          title={t(option.label)}
          tabIndex={value === option.id || (!options.some((item) => item.id === value) && index === 0) ? 0 : -1}
          className={`flex shrink-0 flex-col items-center justify-center rounded-xl border border-transparent p-1 outline-offset-4 transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary aria-checked:border-primary/50 aria-checked:bg-background aria-checked:shadow-sm aria-checked:ring-2 aria-checked:ring-primary/20 disabled:opacity-50 ${itemClassName}`}
          style={itemStyle?.(index)}
          onClick={() => onChange(option.id)}
          onMouseEnter={() => setHovered(option.id)}
          onMouseLeave={() => setHovered(undefined)}
          onFocus={() => setHovered(option.id)}
          onBlur={() => setHovered(undefined)}
          onKeyDown={(event) => {
            const buttons = Array.from(
              group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? []
            )
            const index = buttons.indexOf(event.currentTarget)
            const last = buttons.length - 1
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? last
                  : ['ArrowRight', 'ArrowDown'].includes(event.key)
                    ? (index + 1) % buttons.length
                    : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                      ? (index + last) % buttons.length
                      : -1
            if (next < 0) return
            event.preventDefault()
            buttons[next]?.focus()
            buttons[next]?.click()
            buttons[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          }}
        >
          {render(option.id, !reduced && (hovered === option.id || value === option.id))}
          {showLabels && <span className="max-w-full truncate text-[11px] leading-5">{t(option.label)}</span>}
        </button>
      ))}
    </div>
  )
}
