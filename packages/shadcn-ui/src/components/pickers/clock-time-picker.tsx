// Adapted from sachetsubedi/clock-time-picker (MIT). See THIRD_PARTY_LICENSES.txt.
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { pickerText } from './picker-text'

const pad = (value: number) => String(value).padStart(2, '0')
const outerRadius = 40
const innerRadius = 26
const hourLabels = Array.from({ length: 24 }, (_, index) => (index + 1) % 24)
const minuteLabels = Array.from({ length: 12 }, (_, index) => index * 5)
const isInnerHour = (hour: number) => hour === 0 || hour > 12

export function ClockTimePicker({ value, locale, onAccept, onCancel }: {
    value: string
    locale: string
    onAccept: (time: string) => void
    onCancel: () => void
}) {
    const t = pickerText(locale)
    const [draft, setDraft] = useState(value)
    const [mode, setMode] = useState<'hour' | 'minute'>('hour')
    const [hour, minute] = draft.split(':').map(Number)
    const choosingHour = mode === 'hour'
    const current = choosingHour ? hour : minute
    const divisions = choosingHour ? 12 : 60
    const limit = choosingHour ? 24 : 60
    const radius = choosingHour && isInnerHour(hour) ? innerRadius : outerRadius
    const angle = (current % divisions) * 360 / divisions

    function setPart(next: number) {
        setDraft(choosingHour ? pad(next) + ':' + pad(minute) : pad(hour) + ':' + pad(next))
    }

    function point(event: PointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width - 0.5
        const y = (event.clientY - rect.top) / rect.height - 0.5
        const distance = Math.hypot(x, y) * 100
        if (distance < 5) return false
        const turn = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1
        const tick = Math.round(turn * divisions) % divisions
        if (choosingHour) {
            const inner = distance < (innerRadius + outerRadius) / 2
            const outerHour = tick || 12
            setPart(inner ? (outerHour + 12) % 24 : outerHour)
        } else {
            setPart(tick)
        }
        return true
    }

    function handleKey(event: KeyboardEvent<HTMLDivElement>) {
        switch (event.key) {
            case 'Home': setPart(0); break
            case 'End': setPart(limit - 1); break
            case 'ArrowUp': case 'ArrowRight': setPart((current + 1) % limit); break
            case 'ArrowDown': case 'ArrowLeft': setPart((current + limit - 1) % limit); break
            case 'Enter': case ' ':
                if (choosingHour) setMode('minute')
                else onAccept(draft)
                break
            default: return
        }
        event.preventDefault()
    }

    return <div className="space-y-3">
        <div className="flex items-center justify-center gap-1 tabular-nums">
            {(['hour', 'minute'] as const).map((part) => <span key={part} className="flex items-center gap-1">
                {part === 'minute' && <span aria-hidden="true" className="text-xl text-muted-foreground">:</span>}
                <Button type="button" variant={part === mode ? 'secondary' : 'ghost'} aria-pressed={part === mode}
                    aria-label={t[part] + ' ' + pad(part === 'hour' ? hour : minute)} onClick={() => setMode(part)}
                    className={cn('h-10 min-w-12 text-xl', part === mode && 'text-primary')}>
                    {pad(part === 'hour' ? hour : minute)}
                </Button>
            </span>)}
        </div>
        <div role="slider" tabIndex={0} aria-label={t[mode]} aria-valuemin={0} aria-valuemax={limit - 1}
            aria-valuenow={current} aria-valuetext={draft} onKeyDown={handleKey}
            className="relative mx-auto aspect-square w-full touch-none cursor-pointer rounded-full bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return
                event.currentTarget.focus()
                event.currentTarget.setPointerCapture(event.pointerId)
                point(event)
            }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event) }}
            onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                event.currentTarget.releasePointerCapture(event.pointerId)
                if (point(event) && choosingHour) setMode('minute')
            }}>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-1/2 left-1/2 w-0.5 origin-bottom bg-primary"
                style={{ height: radius + '%', transform: 'translateX(-50%) rotate(' + angle + 'deg)' }}>
                <span className="absolute top-0 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            </span>
            <span aria-hidden="true" className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            {(choosingHour ? hourLabels : minuteLabels).map((number) => {
                const radians = (number / divisions) * 2 * Math.PI
                const inner = choosingHour && isInnerHour(number)
                const distance = inner ? innerRadius : outerRadius
                return <span key={number} aria-hidden="true"
                    className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-sm tabular-nums',
                        inner && 'text-xs text-muted-foreground', number === current && 'font-semibold text-primary-foreground')}
                    style={{ left: (50 + Math.sin(radians) * distance) + '%', top: (50 - Math.cos(radians) * distance) + '%' }}>
                    {pad(number)}
                </span>
            })}
        </div>
        <div className="flex justify-end gap-2 border-t pt-2">
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t.cancel}</Button>
            <Button type="button" size="sm" onClick={() => onAccept(draft)}>{t.done}</Button>
        </div>
    </div>
}
