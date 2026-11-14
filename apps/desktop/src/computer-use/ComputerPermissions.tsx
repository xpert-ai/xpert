import { useEffect, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { Monitor, MousePointer2, CircleCheck, RotateCw } from 'lucide-react'
import { t } from '../i18n'
import { BrandLogo } from '../branding/BrandLogo'
import { invoke } from '../host'
import type { AppState } from '../types'

export function ComputerPermissions({ onFinish }: { onFinish?: (state: AppState) => void }) {
  const [state, setState] = useState<{ screen: boolean; accessibility: boolean }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() {
    try {
      setState(await window.xpertDesktop?.windowControl('status'))
      setError('')
    } catch {
      setState(undefined)
      setError(t('Could not check window permissions.'))
    }
  }
  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  async function finish() {
    if (!onFinish || busy) return
    setBusy(true)
    try {
      onFinish(await invoke('finishComputerSetup'))
    } catch {
      setError(t('Could not save settings.'))
      setBusy(false)
    }
  }
  const panel = (
    <section className="w-full space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t(onFinish ? 'Local window control' : 'System permissions')}</h2>
        {onFinish && (
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            {t('Check permissions')}
          </Button>
        )}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {onFinish
          ? t(
              'Bosi will ask you to choose a window for each task. Window contents are shared with the active Assistant and its model.'
            )
          : t('Permissions are managed by macOS.')}
      </p>
      <div className="divide-y rounded-xl border bg-card">
        {(['screen', 'accessibility'] as const).map((key) => {
          const Icon = key === 'screen' ? Monitor : MousePointer2
          return (
            <div key={key} className="flex items-center gap-4 p-4">
              <Icon className="size-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t(key === 'screen' ? 'Screen Recording' : 'Accessibility')}</p>
                <p className="text-xs text-muted-foreground">
                  {t(key === 'screen' ? 'Read the selected window.' : 'Interact with controls in the selected window.')}
                </p>
              </div>
              {state?.[key] && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <CircleCheck className="size-3.5" />
                  {t('Granted')}
                </span>
              )}
              {(!onFinish || !state?.[key]) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void window.xpertDesktop
                      ?.windowControl(state?.[key] ? 'managePermission' : 'permission', key)
                      .then(refresh)
                      .catch(() => setError(t('Could not check window permissions.')))
                  }
                >
                  {t(state?.[key] ? 'Manage' : 'Open System Settings')}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {!onFinish && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            <RotateCw className="size-4" />
            {t('Check permissions')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {onFinish && (
        <Button className="w-full" disabled={busy} onClick={() => void finish()}>
          {t(state?.screen && state.accessibility ? 'Continue' : 'Set up later')}
        </Button>
      )}
    </section>
  )
  if (!onFinish) return panel
  return (
    <main className="relative flex h-full flex-col overflow-auto bg-background text-foreground">
      <div className="window-drag absolute inset-x-0 top-0 h-12" />
      <div className="m-auto w-full max-w-lg space-y-6 px-7 py-12">
        <BrandLogo className="size-16" />
        {panel}
      </div>
    </main>
  )
}
