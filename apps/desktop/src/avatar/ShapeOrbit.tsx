import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '../i18n'
import { useReducedMotion } from './AppearancePreview'
import { characterShapeSvg } from './custom-character'
import { shapeOptions, type CharacterConfig } from './character-options'

const count = shapeOptions.length
// A broad, shallow arc keeps the shape strip smaller than the expression stage.
const angle = 12
const modulo = (value: number) => ((value % count) + count) % count
// Keep the rotation continuous when cycling from the last shape back to the first.
export function nearestOrbitPosition(position: number, index: number) {
  return position + modulo(index - modulo(position) + count / 2) - count / 2
}

export function ShapeOrbit({
  value,
  color,
  onChange
}: {
  value: CharacterConfig['shape']
  color: string
  onChange: (shape: CharacterConfig['shape']) => void
}) {
  const selected = Math.max(
    0,
    shapeOptions.findIndex((item) => item.id === value)
  )
  const [position, setPosition] = useState(selected)
  const group = useRef<HTMLDivElement>(null)
  const keyboardFocus = useRef(false)
  const wheelStep = useRef(0)
  const reduced = useReducedMotion()
  useEffect(() => setPosition((position) => nearestOrbitPosition(position, selected)), [selected])
  useEffect(() => {
    if (!keyboardFocus.current) return
    group.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true })
    keyboardFocus.current = false
  }, [value])
  const selectIndex = (index: number) => onChange(shapeOptions[modulo(index)].id)
  return (
    <div
      className="pointer-events-none relative mx-auto -mt-28 h-44 w-full max-w-[440px] overflow-hidden"
      onWheel={(event) => {
        // A horizontal trackpad gesture rotates the orbit; vertical scrolling remains available.
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
        const now = Date.now()
        if (now - wheelStep.current < 160) return
        wheelStep.current = now
        selectIndex(selected + Math.sign(event.deltaX))
      }}
    >
      <div
        ref={group}
        role="radiogroup"
        aria-label={t('Shape')}
        className="absolute -left-[40%] bottom-20 aspect-square w-[180%] origin-center transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${position * angle}deg)`, transitionDuration: reduced ? '0s' : undefined }}
      >
        {shapeOptions.map((item, index) => {
          const orbitPosition = nearestOrbitPosition(position, index)
          const distance = Math.abs(orbitPosition - position)
          const radians = (orbitPosition * angle * Math.PI) / 180
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-label={t(item.label)}
              title={t(item.label)}
              aria-checked={value === item.id}
              tabIndex={value === item.id ? 0 : -1}
              className="absolute flex size-[10%] items-center justify-center rounded-3xl border border-transparent p-1.5 outline-offset-2 transition-[transform,opacity,filter,background-color] duration-500 hover:!opacity-100 focus-visible:outline-2 focus-visible:outline-primary aria-checked:border-border aria-checked:bg-muted motion-reduce:transition-none"
              style={{
                left: `${50 + Math.sin(radians) * 50}%`,
                top: `${50 + Math.cos(radians) * 50}%`,
                transform: `translate(-50%, -50%) rotate(${-position * angle}deg) scale(${distance === 0 ? 1 : distance === 1 ? 0.85 : 0.65})`,
                opacity: distance < 1 ? 1 : distance < 2 ? 0.75 : distance < 3 ? 0.3 : 0,
                filter: distance >= 2 ? 'blur(1px)' : undefined,
                pointerEvents: distance > 2 ? 'none' : 'auto',
                transitionDuration: reduced ? '0s' : undefined
              }}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? count - 1
                      : ['ArrowRight', 'ArrowDown'].includes(event.key)
                        ? selected + 1
                        : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                          ? selected - 1
                          : undefined
                if (next === undefined) return
                event.preventDefault()
                keyboardFocus.current = true
                selectIndex(next)
              }}
            >
              <img
                alt=""
                draggable={false}
                className="size-full object-contain"
                src={characterShapeSvg(item.id, color)}
              />
            </button>
          )
        })}
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label={t('Previous shapes')}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          onClick={() => selectIndex(selected - 1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="w-24 text-center text-xs font-medium text-muted-foreground" aria-live="polite">
          {t(shapeOptions[selected].label)}
        </span>
        <button
          type="button"
          aria-label={t('Next shapes')}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          onClick={() => selectIndex(selected + 1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
