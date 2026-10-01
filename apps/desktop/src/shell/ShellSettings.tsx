import { useEffect, useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import { LoaderCircle, Square, Terminal } from 'lucide-react'
import type { ShellResult, ShellSettings as Settings } from '@xpert-ai/contracts'
import { invoke } from '../host'
import { t } from '../i18n'
import type { DesktopShellState } from '../types'
import { ThemeSelect } from '../ThemeFields'

export function ShellSettings({
  resetVersion = 0,
  disabled = false,
  onDirtyChange,
  onBusyChange
}: {
  resetVersion?: number
  disabled?: boolean
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [state, setState] = useState<DesktopShellState | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [operations, setOperations] = useState<ShellResult[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = pending || disabled
  const dirty = !!draft && !!state && JSON.stringify(draft) !== JSON.stringify(state.settings)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => onBusyChange?.(pending), [pending, onBusyChange])
  useEffect(() => {
    if (resetVersion && state) setDraft(state.settings)
    // The parent increments this only when cancelling the current edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetVersion])
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const value = await invoke('shellState')
        if (!active) return
        setState(value)
        setDraft((current) => current ?? value.settings)
        if (value.enabled) {
          const items = await invoke('shellOperations')
          if (active) setOperations(items)
        } else setOperations([])
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : t('Could not load Shell status.'))
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setPending(true)
    setError('')
    try {
      await action()
      setState(await invoke('shellState'))
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Could not update Desktop Shell.'))
    } finally {
      setPending(false)
    }
  }
  if (!state) return <p role={error ? 'alert' : 'status'}>{error || t('Loading Shell status…')}</p>
  if (!state.available || !draft)
    return <p className="text-sm text-muted-foreground">{t('Desktop Shell requires the native macOS app.')}</p>
  const status = state.enabled ? (state.connected ? t('Connected') : t('Connecting…')) : t('Connects when needed')
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-4" />
          <h3 className="text-base font-semibold">{t('This computer Shell')}</h3>
        </div>
        <span role="status" className="text-[0.8125rem] leading-5 text-muted-foreground">
          {status}
        </span>
      </div>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        {t(
          'Allow an authorized conversation to run commands with your computer user permissions. Command output is sent to Xpert. The working directory does not restrict file access.'
        )}
      </p>
      <fieldset disabled={busy}>
        <ThemeSelect
          label={t('Execution permission')}
          value={state.policy ?? 'ask'}
          options={[
            { value: 'ask', label: t('Ask for every command') },
            { value: 'allow', label: t('Always allow in this organization') },
            { value: 'deny', label: t('Never allow') }
          ]}
          onChange={(policy) => {
            if (!busy) void run(() => invoke('shellPolicy', policy))
          }}
        />
      </fieldset>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        {t(
          'Applies only to your account, this organization and this computer. Always allow permits future commands without asking.'
        )}
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="shell-name" className="text-sm leading-5">
            {t('Computer name')}
          </Label>
          <Input
            className="h-10 text-sm"
            id="shell-name"
            value={draft.name}
            disabled={busy}
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>
        <fieldset disabled={busy}>
          <ThemeSelect
            label={t('Shell')}
            value={draft.shell}
            options={[
              { value: '/bin/zsh', label: 'zsh' },
              { value: '/bin/bash', label: 'bash' }
            ]}
            onChange={(shell) => {
              if (!busy) setDraft({ ...draft, shell })
            }}
          />
        </fieldset>
        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor="shell-cwd" className="text-sm leading-5">
            {t('Default working directory')}
          </Label>
          <Input
            className="h-10 text-sm"
            id="shell-cwd"
            value={draft.cwd}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, cwd: event.target.value })}
          />
        </div>
        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor="shell-path" className="text-sm leading-5">
            {t('Command search path')}
          </Label>
          <Input
            className="h-10 text-sm"
            id="shell-path"
            value={draft.path}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, path: event.target.value })}
          />
        </div>
      </div>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        {t('Bosi connects when a local command is requested. Each command starts a fresh, non-interactive shell.')}
      </p>
      <Button
        type="button"
        className="h-10"
        disabled={busy}
        variant={state.enabled ? 'outline' : 'default'}
        onClick={() => void run(() => invoke('shellConfigure', draft))}
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {t('Apply Shell settings')}
      </Button>
      {(error || state.errorCode) && (
        <p role="alert" className="text-sm text-destructive">
          {error || t('Desktop Shell could not connect. Check the service and try a new command.')}
        </p>
      )}
      {operations.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{t('Recent commands')}</h3>
          {operations.map((operation) => (
            <div key={operation.operationId} className="space-y-2 border-b pb-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{operation.cwd}</span>
                <span>{shellStateLabel(operation.state)}</span>
                {['pending', 'running', 'cancel_requested'].includes(operation.state) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => invoke('shellCancel', operation.operationId))}
                  >
                    <Square className="size-3" />
                    {t('Stop command')}
                  </Button>
                )}
              </div>
              {(operation.stdout || operation.stderr) && (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2">
                  {(operation.stdout + operation.stderr).slice(-4000)}
                </pre>
              )}
              {operation.truncated && <p className="text-muted-foreground">{t('Command output was truncated.')}</p>}
              {operation.state === 'unknown' && (
                <p className="text-muted-foreground">
                  {t('The result is unknown. This command was not executed again.')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
export function shellStateLabel(state: string) {
  switch (state) {
    case 'pending':
      return t('Pending')
    case 'running':
      return t('Running')
    case 'cancel_requested':
      return t('Stopping…')
    case 'succeeded':
      return t('Succeeded')
    case 'failed':
      return t('Failed')
    case 'cancelled':
      return t('Cancelled')
    case 'timed_out':
      return t('Timed out')
    case 'rejected':
      return t('Rejected')
    default:
      return t('Unknown')
  }
}
