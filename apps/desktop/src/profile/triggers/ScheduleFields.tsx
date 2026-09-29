import { useId, useState } from 'react'
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui'
import { t } from '../../i18n'

const frequencies = ['hourly', 'daily', 'weekdays', 'weekly', 'custom'] as const
type Frequency = (typeof frequencies)[number]
const labels: Record<Frequency, string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  custom: 'Custom schedule'
}
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function parseSchedule(cron: string) {
  const parts = /^(\d{1,2}) (\*|\d{1,2}) \* \* (\*|1-5|[0-6])$/.exec(cron)
  if (!parts || Number(parts[1]) > 59 || (parts[2] !== '*' && Number(parts[2]) > 23))
    return { frequency: 'custom' as Frequency, minute: 0, time: '08:00', day: '1' }
  const frequency: Frequency =
    parts[2] === '*'
      ? parts[3] === '*'
        ? 'hourly'
        : 'custom'
      : parts[3] === '*'
        ? 'daily'
        : parts[3] === '1-5'
          ? 'weekdays'
          : 'weekly'
  return {
    frequency,
    minute: Number(parts[1]),
    time: `${parts[2] === '*' ? '08' : parts[2].padStart(2, '0')}:${parts[1].padStart(2, '0')}`,
    day: /^[0-6]$/.test(parts[3]) ? parts[3] : '1'
  }
}

export function scheduleSummary(cron: string) {
  const schedule = parseSchedule(cron)
  if (schedule.frequency === 'custom') return cron
  if (schedule.frequency === 'hourly') return `${t('Every hour')} · :${String(schedule.minute).padStart(2, '0')}`
  return `${t(schedule.frequency === 'weekly' ? days[Number(schedule.day)] : labels[schedule.frequency])} · ${schedule.time}`
}

export function ScheduleFields({
  value,
  onChange,
  disabled
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const id = useId()
  const [frequency, setFrequency] = useState(parseSchedule(value).frequency)
  const schedule = { ...parseSchedule(value), frequency }
  const update = (frequency: Frequency, time = schedule.time, day = schedule.day, minute = schedule.minute) => {
    setFrequency(frequency)
    const [hour, minutes] = time.split(':').map(Number)
    onChange(
      frequency === 'custom'
        ? value
        : frequency === 'hourly'
          ? `${minute} * * * *`
          : `${minutes} ${hour} * * ${frequency === 'daily' ? '*' : frequency === 'weekdays' ? '1-5' : day}`
    )
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-frequency`}>{t('Repeat')}</Label>
        <Select
          value={schedule.frequency}
          disabled={disabled}
          onValueChange={(value) => {
            if (frequencies.some((item) => item === value)) update(value as Frequency)
          }}
        >
          <SelectTrigger id={`${id}-frequency`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {frequencies.map((frequency) => (
              <SelectItem key={frequency} value={frequency}>
                {t(labels[frequency])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {schedule.frequency === 'custom' ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-cron`}>{t('Cron expression')}</Label>
          <Input
            id={`${id}-cron`}
            value={value}
            required
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('Minute, hour, day of month, month, day of week.')}</p>
        </div>
      ) : schedule.frequency === 'hourly' ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-minute`}>{t('Minute of the hour')}</Label>
          <Input
            id={`${id}-minute`}
            type="number"
            min={0}
            max={59}
            required
            disabled={disabled}
            value={schedule.minute}
            onChange={(event) => update('hourly', undefined, undefined, Number(event.target.value))}
          />
        </div>
      ) : (
        <>
          {schedule.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-day`}>{t('Day of week')}</Label>
              <Select
                value={schedule.day}
                disabled={disabled}
                onValueChange={(day) => update('weekly', undefined, day)}
              >
                <SelectTrigger id={`${id}-day`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((day, index) => (
                    <SelectItem key={day} value={String(index)}>
                      {t(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${id}-time`}>{t('Time (server timezone)')}</Label>
            <Input
              id={`${id}-time`}
              type="time"
              required
              value={schedule.time}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) update(schedule.frequency, event.target.value)
              }}
            />
          </div>
        </>
      )}
      <p className="text-xs leading-5 text-muted-foreground">{t('Schedules follow the Xpert server’s timezone.')}</p>
    </div>
  )
}
