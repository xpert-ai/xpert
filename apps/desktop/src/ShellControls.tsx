import { useEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { Terminal, Unplug, LoaderCircle } from 'lucide-react'
import { invoke } from './host'
import { t } from './i18n'
import type { DesktopShellState, DesktopShellGrant } from './types'

export function ShellControls({
  assistantId,
  threadId,
  onGrant
}: {
  assistantId: string
  threadId: string | null
  onGrant: (id: string | null) => void
}) {
  const [state, setState] = useState<DesktopShellState | null>(null)
  const [grant, setGrant] = useState<DesktopShellGrant | null>(null)
  const grantRef = useRef<DesktopShellGrant | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const activeThread = useRef(threadId)
  activeThread.current = threadId
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const value = await invoke('shellState')
        if (!active) return
        setState(value)
        if ((!value.enabled || (grantRef.current?.expiresAt ?? Infinity) <= Date.now()) && grantRef.current) {
          grantRef.current = null
          setGrant(null)
          onGrant(null)
        }
      } catch {
        /* A disconnected host is displayed by the main app. */
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onGrant])
  useEffect(() => {
    const current = grantRef.current
    if (!current) return
    if (!current.threadId && threadId) {
      current.threadId = threadId
      setGrant({ ...current })
      return
    }
    if (current.threadId !== threadId) {
      // The previous run retains its grant until explicitly revoked or the device is disabled.
      grantRef.current = null
      setGrant(null)
      onGrant(null)
    }
  }, [threadId, onGrant])
  if (!state?.available || !state.enabled) return null
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
      <Terminal className="size-3.5 text-muted-foreground" />
      <span className="flex-1 text-muted-foreground">
        {grant
          ? t('This conversation can use {{name}}', { name: state.settings?.name ?? '' })
          : t('Desktop Shell is available for this conversation.')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={pending || (!grant && !state.connected)}
        onClick={async () => {
          setPending(true)
          setError('')
          const requestedThread = activeThread.current
          try {
            if (grant) {
              onGrant(null)
              grantRef.current = null
              setGrant(null)
              await invoke('shellUnbind', grant.id)
            } else {
              const next = await invoke('shellBind', { assistantId, threadId: requestedThread })
              if (activeThread.current !== requestedThread) {
                await invoke('shellUnbind', next.id)
                return
              }
              grantRef.current = next
              setGrant(next)
              onGrant(next.id)
            }
          } catch (error) {
            setError(error instanceof Error ? error.message : t('Could not authorize Desktop Shell.'))
          } finally {
            setPending(false)
          }
        }}
      >
        {pending ? <LoaderCircle className="size-3 animate-spin" /> : grant ? <Unplug className="size-3" /> : null}
        {grant ? t('Disconnect this conversation') : state.connected ? t('Use this computer') : t('Computer offline')}
      </Button>
      {error && (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
