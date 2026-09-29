import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@xpert-ai/shadcn-ui'
import { Download, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react'
import { t } from './i18n'
import type { UpdateState } from './update-types'

export function DesktopUpdate({ compact = false }: { compact?: boolean }) {
  const bridge = window.xpertDesktop?.updates
  const [state, setState] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  const [hostError, setHostError] = useState(false)
  const prompted = useRef<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const accept = (next: UpdateState) =>
    setState((current) => (!current || next.revision >= current.revision ? next : current))
  useEffect(() => {
    if (!bridge) return
    let active = true
    const receive = (next: UpdateState) => {
      if (active) accept(next)
    }
    // Subscribe first; revisions prevent a late snapshot from overwriting progress.
    const unsubscribe = bridge.onState(receive)
    void bridge
      .getState()
      .then(receive)
      .catch(() => {
        if (active) setHostError(true)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [bridge])
  useEffect(() => {
    if (state?.status === 'downloaded' && prompted.current !== state.version) {
      prompted.current = state.version
      setOpen(true)
    }
  }, [state?.status, state?.version])

  if (!bridge || (!hostError && (!state || ['disabled', 'idle', 'checking'].includes(state.status)))) return null
  const downloading = state?.status === 'downloading'
  const installing = state?.status === 'installing'
  const ready = state?.status === 'downloaded' || (state?.status === 'error' && state.operation === 'install')
  const failed = hostError || state?.status === 'error'
  const percent = Math.floor(state?.percent || 0)
  const errorText = hostError
    ? t('Cannot connect to the desktop service. Please retry.')
    : state?.operation === 'install'
      ? t('Could not install the update. Please retry.')
      : state?.operation === 'download'
        ? t('Could not download the update. Check your connection and retry.')
        : t('Could not check for updates. Check your connection and retry.')
  const action = async (method: 'check' | 'download' | 'install' | 'getState') => {
    setHostError(false)
    try {
      accept(await bridge[method]())
    } catch {
      setHostError(true)
      setOpen(true)
    }
  }
  const label = downloading
    ? t('Downloading update: {{percent}}%', { percent })
    : installing
      ? t('Installing update…')
      : failed
        ? t('Retry update')
        : ready
          ? t('Install and restart')
          : t('Update')
  const icon =
    downloading || installing ? (
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
    ) : failed ? (
      <RefreshCw className="size-4" aria-hidden="true" />
    ) : ready ? (
      <RotateCw className="size-4" aria-hidden="true" />
    ) : (
      <Download className="size-4" aria-hidden="true" />
    )
  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        className={`group relative h-8 shrink-0 overflow-hidden rounded-full p-0 transition-[width] motion-reduce:transition-none ${compact ? 'w-8' : downloading ? 'w-20' : installing ? 'w-8' : 'w-8 hover:w-16 focus-visible:w-16'}`}
        aria-label={label}
        title={failed ? errorText : label}
        aria-haspopup="dialog"
        onClick={() => {
          if (state?.status === 'available' && !hostError) void action('download')
          else setOpen(true)
        }}
      >
        <span
          className={`flex items-center justify-center gap-1.5 ${!compact && !downloading && !installing ? 'group-hover:hidden group-focus-visible:hidden' : ''}`}
        >
          {icon}
          {downloading && !compact && <span className="text-xs tabular-nums">{percent}%</span>}
        </span>
        {!compact && !downloading && !installing && (
          <span className="hidden text-xs group-hover:inline group-focus-visible:inline">
            {failed ? t('Retry') : ready ? t('Restart') : t('Update')}
          </span>
        )}
        {downloading && (
          <span className="absolute bottom-0 left-0 h-0.5 bg-primary-foreground/50" style={{ width: `${percent}%` }} />
        )}
      </Button>
      <span className="sr-only" role="status">
        {downloading ? t('Downloading update…') : ready ? t('Update ready to install') : label}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {ready ? t('Update ready to install') : installing ? t('Installing update…') : t('Desktop update')}
            </DialogTitle>
            <DialogDescription>
              {ready
                ? t(
                    'Bosi {{version}} is ready. Save your work before restarting. The app will quit, install the update, and reopen.',
                    { version: state?.version || '' }
                  )
                : installing
                  ? t('Bosi will quit and restart to finish updating.')
                  : t('Current version: {{version}}', { version: state?.currentVersion || '' })}
            </DialogDescription>
          </DialogHeader>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {errorText}
            </p>
          )}
          {downloading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('Downloading update…')}</span>
                <span className="tabular-nums">{percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={t('Downloading update…')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ready ? t('Later') : t('Close')}
            </Button>
            {!downloading && !installing && (
              <Button
                onClick={() =>
                  void action(
                    hostError ? 'getState' : ready ? 'install' : state?.operation === 'check' ? 'check' : 'download'
                  )
                }
              >
                {hostError ? t('Retry') : ready ? t('Install and restart') : failed ? t('Retry') : t('Update')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
