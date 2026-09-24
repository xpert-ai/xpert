import { useEffect, useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import { LoaderCircle, Square, Terminal } from 'lucide-react'
import type { ShellResult, ShellSettings as Settings } from '@xpert-ai/contracts'
import { invoke } from './host'
import { t } from './i18n'
import type { DesktopShellState } from './types'
import { ThemeSelect } from './ThemeFields'

export function ShellSettings() {
  const [state, setState] = useState<DesktopShellState | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [operations, setOperations] = useState<ShellResult[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
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
  if (!state) return <p role="status">{t('Loading Shell status…')}</p>
  if (!state.available || !draft)
    return <p className="text-sm text-muted-foreground">{t('Desktop Shell requires the native macOS app.')}</p>
  const status = state.enabled ? (state.connected ? t('Connected') : t('Connecting…')) : t('Disabled')
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-4" />
          <h3 className="font-medium">{t('This computer Shell')}</h3>
        </div>
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          'Allow an authorized conversation to run commands with your computer user permissions. Command output is sent to Xpert. The working directory does not restrict file access.'
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="shell-name">{t('Computer name')}</Label>
          <Input
            id="shell-name"
            value={draft.name}
            disabled={pending || state.enabled}
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>
        <fieldset disabled={pending || state.enabled}>
          <ThemeSelect
            label={t('Shell')}
            value={draft.shell}
            options={[
              { value: '/bin/zsh', label: 'zsh' },
              { value: '/bin/bash', label: 'bash' }
            ]}
            onChange={(shell) => {
              if (!state.enabled && !pending) setDraft({ ...draft, shell })
            }}
          />
        </fieldset>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="shell-cwd">{t('Default working directory')}</Label>
          <Input
            id="shell-cwd"
            value={draft.cwd}
            disabled={pending || state.enabled}
            onChange={(event) => setDraft({ ...draft, cwd: event.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="shell-path">{t('Command search path')}</Label>
          <Input
            id="shell-path"
            value={draft.path}
            disabled={pending || state.enabled}
            onChange={(event) => setDraft({ ...draft, path: event.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Shell changes apply immediately. Enable again after restarting the app. Each command starts a fresh, non-interactive shell.'
        )}
      </p>
      <Button
        type="button"
        disabled={pending}
        variant={state.enabled ? 'outline' : 'default'}
        onClick={() => void run(() => (state.enabled ? invoke('shellDisable') : invoke('shellEnable', draft)))}
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {state.enabled ? t('Disable Shell') : t('Enable Shell')}
      </Button>
      {(error || state.errorCode) && (
        <p role="alert" className="text-sm text-destructive">
          {error || t('Desktop Shell could not connect. Check the service and enable it again.')}
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
                    disabled={pending}
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
