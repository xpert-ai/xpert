import { DatePicker, TimePicker, TimeZonePicker } from '@xpert-ai/shadcn-ui'
import type { FirstRun } from './bridge'
import { texts } from './i18n'

export function defaultFirstRun(timeZone: string, intervalMinutes: number): FirstRun {
    const at = new Date(Date.now() + intervalMinutes * 60000)
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(at)
    const part = (key: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === key)!.value
    return { date: [part('year'), part('month'), part('day')].join('-'), time: part('hour') + ':' + part('minute') }
}

export function MonitorStartFields({ locale, firstRun, timeZone, disabled, onChange, onZone }: {
    locale: string; firstRun: FirstRun; timeZone: string; disabled: boolean
    onChange: (value: FirstRun) => void; onZone: (value: string) => void
}) {
    return <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-semibold">{texts(locale).firstCheck}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DatePicker locale={locale} value={firstRun.date} disabled={disabled}
                onChange={(date) => onChange({ ...firstRun, date })} />
            <TimePicker locale={locale} value={firstRun.time} disabled={disabled}
                onChange={(time) => onChange({ ...firstRun, time })} />
            <TimeZonePicker locale={locale} value={timeZone} disabled={disabled} onChange={onZone} />
        </div>
    </fieldset>
}
