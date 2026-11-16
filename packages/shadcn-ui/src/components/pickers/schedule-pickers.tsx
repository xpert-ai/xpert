import { useId, useState, type Ref } from 'react'
import { CalendarDays, Clock3 } from 'lucide-react'
import { Button } from '../ui/button'
import { Calendar } from '../ui/calendar'
import { zhCN } from 'react-day-picker/locale'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ClockTimePicker } from './clock-time-picker'
import { pickerText } from './picker-text'

const twoDigits = (n: number) => String(n).padStart(2, '0')
export function TimePicker({ value, locale, disabled, onChange, label }: {
    value: string; locale: string; label?: string; disabled?: boolean; onChange: (value: string) => void
}) {
    const t = pickerText(locale), id = useId()
    const [open, setOpen] = useState(false)
    return <div className="space-y-1.5">
        <Label htmlFor={id} id={id + '-label'}>{label ?? t.time}</Label>
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button id={id} type="button" variant="outline" disabled={disabled}
                    aria-labelledby={id + '-label ' + id + '-value'}
                    className="w-full justify-start border-input font-normal tabular-nums">
                    <Clock3 aria-hidden="true" className="text-muted-foreground" /><span id={id + '-value'}>{value}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" aria-label={t.chooseTime} className="w-64 max-w-[calc(100vw-1rem)] p-3">
                {open && <ClockTimePicker value={value} locale={locale}
                    onCancel={() => setOpen(false)} onAccept={(time) => { onChange(time); setOpen(false) }} />}
            </PopoverContent>
        </Popover>
    </div>
}

export function DatePicker({ value, locale, disabled, onChange, triggerRef, error, label }: {
    value?: string; locale: string; label?: string; disabled?: boolean; onChange: (value: string) => void
    triggerRef?: Ref<HTMLButtonElement>; error?: string
}) {
    const t = pickerText(locale), id = useId(), [open, setOpen] = useState(false)
    // A schedule date is a calendar day in the task's time zone, never a UTC timestamp.
    const selected = value ? new Date(value + 'T12:00:00') : undefined
    const hasDate = selected && Number.isFinite(selected.getTime())
    return <div className="space-y-1.5">
        <Label htmlFor={id} id={id + '-label'}>{label ?? t.date}</Label>
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" ref={triggerRef} id={id} variant="outline" disabled={disabled}
                    aria-labelledby={id + '-label ' + id + '-value'} aria-invalid={!!error || undefined}
                    aria-describedby={error ? id + '-error' : undefined}
                    className="w-full justify-start border-input font-normal">
                    <CalendarDays aria-hidden="true" className="text-muted-foreground" />
                    <span id={id + '-value'} className={hasDate ? undefined : 'text-muted-foreground'}>
                        {hasDate ? new Intl.DateTimeFormat(locale.replace(/_/g, '-'), { dateStyle: 'medium' }).format(selected) : t.chooseDate}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" aria-label={t.chooseDate} className="w-auto p-0"
                onOpenAutoFocus={(event) => event.preventDefault()}>
                <Calendar mode="single" autoFocus required locale={t.locale === 'zh-Hans' ? zhCN : undefined}
                    selected={hasDate ? selected : undefined} defaultMonth={hasDate ? selected : undefined} onSelect={(date) => {
                        onChange([String(date.getFullYear()).padStart(4, '0'), twoDigits(date.getMonth() + 1), twoDigits(date.getDate())].join('-'))
                        setOpen(false)
                    }} />
            </PopoverContent>
        </Popover>
        {error && <p role="alert" id={id + '-error'} className="text-sm text-destructive">{error}</p>}
    </div>
}
