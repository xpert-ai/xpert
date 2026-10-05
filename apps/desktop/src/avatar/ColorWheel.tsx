import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@xpert-ai/shadcn-ui'
import { t } from '../i18n'
import { studioColors } from './character-options'
import { VisualChoices } from './VisualChoices'

const rainbow = 'conic-gradient(#ffb1c6, #ffe88b, #9eeec5, #8adfff, #c8a5ff, #ffb1c6)'
export function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keyboard = useRef(false)
  const pinned = useRef(false)
  const custom = useRef<HTMLInputElement>(null)
  const cancelClose = () => clearTimeout(closing.current)
  const changeOpen = (next: boolean) => {
    cancelClose()
    if (!next) pinned.current = false
    setOpen(next)
  }
  const closeSoon = () => {
    cancelClose()
    if (pinned.current || custom.current === document.activeElement) return
    closing.current = setTimeout(() => changeOpen(false), 160)
  }
  useEffect(() => () => clearTimeout(closing.current), [])
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('Choose character color')}
          className="relative size-14 shrink-0 rounded-full p-1 shadow-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
          style={{ background: rainbow }}
          onMouseEnter={() => {
            cancelClose()
            keyboard.current = false
            setOpen(true)
          }}
          onMouseLeave={closeSoon}
          onClick={(event) => {
            event.preventDefault()
            cancelClose()
            pinned.current = true
            setOpen(true)
          }}
          onKeyDown={(event) => {
            keyboard.current = true
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              pinned.current = true
              setOpen(true)
            }
          }}
        >
          <span
            className="block size-full rounded-full border-[3px] border-background"
            style={{ backgroundColor: value }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('Colors')}
        side="top"
        align="center"
        sideOffset={-30}
        collisionPadding={16}
        className="relative size-60 rounded-full border-0 p-1 shadow-xl motion-reduce:animate-none"
        style={{ background: rainbow }}
        onMouseEnter={cancelClose}
        onMouseLeave={closeSoon}
        onOpenAutoFocus={(event) => {
          if (!keyboard.current) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (!keyboard.current) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          event.stopPropagation()
          changeOpen(false)
        }}
      >
        <div className="relative size-full rounded-full border-[5px] border-background bg-background">
          <VisualChoices
            label="Colors"
            value={value}
            options={studioColors.map((id) => ({ id, label: id }))}
            onChange={onChange}
            className="absolute inset-0"
            showLabels={false}
            itemClassName="absolute size-[25%] -translate-x-1/2 -translate-y-1/2 !rounded-full !p-0 shadow-sm hover:z-20 hover:scale-110 aria-checked:z-20 aria-checked:!ring-2 aria-checked:!ring-foreground"
            itemStyle={(index) => {
              const outer = index < 10
              const count = outer ? 10 : 6
              const angle = ((((index - (outer ? 0 : 10)) * 360) / count - 90) * Math.PI) / 180
              const radius = outer ? 33 : 18
              return {
                left: `${50 + Math.cos(angle) * radius}%`,
                top: `${50 + Math.sin(angle) * radius}%`,
                backgroundColor: studioColors[index]
              }
            }}
            render={() => null}
          />
          <label
            title={t('Custom color')}
            className="absolute left-1/2 top-1/2 z-30 flex size-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background shadow-md focus-within:ring-2 focus-within:ring-primary"
          >
            <span
              className="pointer-events-none size-6 rounded-full"
              style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            />
            <input
              ref={custom}
              type="color"
              aria-label={t('Custom color')}
              value={value}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}
