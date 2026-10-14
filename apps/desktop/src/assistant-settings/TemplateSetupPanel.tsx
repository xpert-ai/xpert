import { useEffect, useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import type { AssistantTemplateSetup, TemplateSetupUpdate, TemplateRoutineStatus } from '@xpert-ai/contracts'
import { invoke } from '../host'
import { t } from '../i18n'

export function TemplateSetupPanel({ botId, webUrl }: { botId: string; webUrl: string }) {
  const [setup, setSetup] = useState<AssistantTemplateSetup | null>(null)
  const [preferences, setPreferences] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function accept(value: AssistantTemplateSetup) {
    setSetup(value)
    setPreferences(value.state.preferences ?? {})
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setBusy(false)
    }
  }
  async function reload() {
    await perform(async () => accept(await invoke('assistantTemplateSetup', { botId })))
  }
  useEffect(() => {
    let active = true
    void invoke('assistantTemplateSetup', { botId })
      .then((value) => {
        if (active) accept(value)
      })
      .catch((error) => {
        if (active) setError(String(error))
      })
    return () => {
      active = false
    }
  }, [botId])
  async function update(input: Omit<TemplateSetupUpdate, 'revision'>) {
    if (!setup) return
    await perform(async () =>
      accept(
        await invoke('updateAssistantTemplateSetup', { botId, update: { ...input, revision: setup.state.revision } })
      )
    )
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!setup && !error && <p role="status">{t('Loading…')}</p>}
      {setup?.onboarding && (
        <section className="space-y-3">
          <h3 className="font-medium">{setup.state.completedAt ? t('Setup completed') : t('Get started')}</h3>
          <p className="text-sm text-muted-foreground">{setup.onboarding.completionCriteria}</p>
          {(setup.onboarding.preferences ?? []).map((key) => (
            <Label className="block space-y-1" key={key}>
              {key}
              <Input
                value={preferences[key] ?? ''}
                onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.value }))}
              />
            </Label>
          ))}
          <Button type="button" disabled={busy} onClick={() => void update({ preferences })}>
            {t('Save preferences')}
          </Button>
          {!setup.state.completedAt && (
            <p className="text-sm text-muted-foreground">
              {t('Continue in chat to run the getting-started skill and produce your first result.')}
            </p>
          )}
          {setup.state.firstResult && <p className="whitespace-pre-wrap text-sm">{setup.state.firstResult}</p>}
        </section>
      )}
      {!!setup?.connectors.length && (
        <section className="space-y-3">
          <h3 className="font-medium">{t('Template connections')}</h3>
          {setup.connectors.map((item) => {
            const choice = setup.state.connectors?.[item.key]
            return (
              <div key={item.key} className="space-y-2 border-b border-border pb-3">
                <p>
                  {item.purpose} · {item.required ? t('Required') : t('Optional')}
                </p>
                <p className="text-sm text-muted-foreground">{t(`Template connection: ${item.status}`)}</p>
                <Label className="block space-y-1">
                  {t('Connection')}
                  <select
                    className="w-full rounded-md border border-input bg-background p-2"
                    disabled={busy}
                    value={choice?.choice === 'binding' ? choice.bindingId : ''}
                    onChange={(event) => {
                      if (event.target.value)
                        void update({
                          connector: { key: item.key, selection: { choice: 'binding', bindingId: event.target.value } }
                        })
                    }}
                  >
                    <option value="">{t('Select a connection')}</option>
                    {item.options.map((option) => (
                      <option key={option.bindingId} value={option.bindingId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Label>
                {!item.required && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void update({ connector: { key: item.key, selection: { choice: 'skip' } } })}
                  >
                    {t('Skip optional connection')}
                  </Button>
                )}
              </div>
            )
          })}
          {setup.managementUrl && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(new URL(setup.managementUrl!, webUrl).toString(), '_blank', 'noopener,noreferrer')
              }
            >
              {t('Manage connections in Xpert')}
            </Button>
          )}
        </section>
      )}
      {!!setup?.routines.length && (
        <section className="space-y-3">
          <h3 className="font-medium">{t('Template routines')}</h3>
          {setup.routines.map((routine) => (
            <Routine
              key={routine.key}
              value={routine}
              busy={busy}
              save={async (input) => {
                await perform(async () => {
                  await invoke('updateAssistantTemplateRoutine', { botId, key: routine.key, update: input })
                  accept(await invoke('assistantTemplateSetup', { botId }))
                })
              }}
            />
          ))}
        </section>
      )}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>
        {t('Refresh')}
      </Button>
    </div>
  )
}
function Routine({
  value,
  busy,
  save
}: {
  value: TemplateRoutineStatus
  busy: boolean
  save: (input: { enabled: boolean; expression: string; timeZone: string }) => Promise<void>
}) {
  const [expression, setExpression] = useState(value.expression)
  const [timeZone, setTimeZone] = useState(value.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  useEffect(() => {
    setExpression(value.expression)
    setTimeZone(value.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [value.expression, value.timeZone])
  return (
    <div className="space-y-2 border-b border-border pb-3">
      <p>
        {value.key} · {value.enabled ? t('Enabled') : t('Paused')}
      </p>
      <p className="text-sm text-muted-foreground">{value.output}</p>
      {!value.supported && <p role="status">{t('Event routines are not supported yet.')}</p>}
      <Label className="block">
        {t('Schedule (cron)')}
        <Input value={expression} onChange={(event) => setExpression(event.target.value)} />
      </Label>
      <Label className="block">
        {t('Time zone')}
        <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} />
      </Label>
      {value.nextRunAt && (
        <p className="text-sm">
          {t('Next run')}: {new Date(value.nextRunAt).toLocaleString(undefined, { timeZone: value.timeZone })} (
          {value.timeZone})
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy || !value.supported}
          onClick={() => void save({ enabled: !value.enabled, expression, timeZone })}
        >
          {value.enabled ? t('Pause') : t('Enable routine')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !value.supported}
          onClick={() => void save({ enabled: value.enabled, expression, timeZone })}
        >
          {t('Save schedule')}
        </Button>
      </div>
    </div>
  )
}
