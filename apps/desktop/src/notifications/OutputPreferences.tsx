import { useState } from 'react'
import type { OutputPreference } from '@xpert-ai/contracts'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import { invoke } from '../host'
import { t, useLocale } from '../i18n'
import type { HostMethods } from '../types'

export function OutputPreferences() {
  const locale = useLocale()
  const [data, setData] = useState<HostMethods['notificationPreferences']['output'] | null>(null)
  const [draft, setDraft] = useState<OutputPreference | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hours, setHours] = useState({ start: '', end: '', zone: '' })
  const load = async () => {
    setFailed(false)
    if (data) {
      setData(null)
      setDraft(null)
      return
    }
    try {
      setData(await invoke('notificationPreferences', undefined))
    } catch {
      setFailed(true)
    }
  }
  const edit = (kind: string, channel: OutputPreference['channel']) => {
    const saved = data?.preferences.find((p) => p.kind === kind && p.channel === channel)
    setDraft(saved ?? { kind, channel, enabled: channel === 'in_app', quiet: null, integrationId: null })
    setHours(saved?.quiet ?? { start: '', end: '', zone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  }
  const save = async (enabled: boolean) => {
    if (!draft || !data || busy) return
    const next = {
      ...draft,
      enabled,
      quiet: enabled && (hours.start || hours.end) ? hours : null,
      integrationId: enabled && draft.channel === 'lark' ? draft.integrationId : null
    }
    setBusy(true)
    setFailed(false)
    try {
      await invoke('notificationSavePreference', next)
      setData({
        ...data,
        preferences: [...data.preferences.filter((p) => p.kind !== next.kind || p.channel !== next.channel), next]
      })
      setDraft(null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-2">
      <Button variant="outline" onClick={load}>
        {t('Delivery preferences')}
      </Button>
      {data?.kinds.map((kind) => (
        <div key={kind.key}>
          <h4>{locale.startsWith('zh') ? kind.label.zh_Hans : kind.label.en_US}</h4>
          {(['in_app', 'lark'] as const).map((channel) => {
            const enabled =
              data.preferences.find((p) => p.kind === kind.key && p.channel === channel)?.enabled ??
              channel === 'in_app'
            return (
              <Button key={channel} variant="ghost" disabled={busy} onClick={() => edit(kind.key, channel)}>
                {t(channel === 'lark' ? 'Feishu private chat' : 'In-app')} · {t(enabled ? 'On' : 'Off')}
              </Button>
            )
          })}
        </div>
      ))}
      {draft && data && (
        <div className="grid gap-2">
          {draft.channel === 'lark' && (
            <Select
              value={draft.integrationId ?? ''}
              onValueChange={(integrationId) => setDraft({ ...draft, integrationId })}
            >
              <SelectTrigger aria-label={t('Bot')}>
                <SelectValue placeholder={t('Bot')} />
              </SelectTrigger>
              <SelectContent>
                {data.integrations.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(['zone', 'start', 'end'] as const).map((field) => (
            <label key={field}>
              {t({ zone: 'Time zone', start: 'Quiet hours start', end: 'Quiet hours end' }[field])}
              <Input
                type={field === 'zone' ? 'text' : 'time'}
                value={hours[field]}
                onChange={(e) => setHours({ ...hours, [field]: e.target.value })}
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => save(true)}>
              {t('Enable and save')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => save(false)}>
              {t('Turn off')}
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p role="alert">{t('Could not save or load preferences. Check the time range and account binding.')}</p>
      )}
    </section>
  )
}
