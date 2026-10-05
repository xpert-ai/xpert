import { useCallback, useEffect, useRef, useState } from 'react'
import type { BosiOnboardingCatalog, BosiOnboardingItem } from '@xpert-ai/contracts'
import { Button } from '@xpert-ai/shadcn-ui'
import { Check, LoaderCircle, Plug, RefreshCw } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'
import { platformCommandUrl } from '../../electron/workbench-platform.mjs'

export function BosiConnections({ onContinue, onEmpty }: { onContinue: () => void; onEmpty: () => void }) {
  const [catalog, setCatalog] = useState<BosiOnboardingCatalog>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [attempt, setAttempt] = useState<string>()
  const alive = useRef(true)
  const mutation = useRef(false)
  const request = useRef(0)
  const onEmptyRef = useRef(onEmpty)
  onEmptyRef.current = onEmpty
  const refresh = useCallback(async (skipEmpty = false) => {
    if (mutation.current) return
    const version = ++request.current
    setLoading(true)
    setError('')
    try {
      const next = await invoke('bosiOnboarding')
      if (!alive.current || version !== request.current) return
      setCatalog(next)
      if (skipEmpty && !next.items.some((item) => item.canSelect || item.canConnect || item.selected))
        onEmptyRef.current()
    } catch (reason) {
      if (alive.current && version === request.current)
        setError(reason instanceof Error ? reason.message : t('Could not load capabilities.'))
    } finally {
      if (alive.current && version === request.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh(true)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => {
      alive.current = false
      request.current++
      window.removeEventListener('focus', focus)
    }
  }, [refresh])
  useEffect(() => {
    if (!attempt) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await invoke('bosiCheckConnection', { attemptId: attempt })
        if (cancelled) return
        if (result.status === 'connected') {
          setAttempt(undefined)
          void refresh()
        } else timer = setTimeout(poll, 2000)
      } catch (reason) {
        if (!cancelled) {
          setAttempt(undefined)
          setError(reason instanceof Error ? reason.message : t('Could not connect this service.'))
        }
      }
    }
    timer = setTimeout(poll, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attempt, refresh])
  const act = async (item: BosiOnboardingItem, connect: boolean) => {
    if (!catalog || mutation.current) return
    mutation.current = true
    request.current++
    setLoading(false)
    setBusy(`${item.kind}:${item.id}`)
    setError('')
    try {
      if (connect) {
        const result = await invoke('bosiConnect', { provider: item.id })
        const next = await invoke('bosiOnboarding')
        if (!alive.current) return
        setCatalog(next)
        let opened = false
        if (window.xpertDesktop) opened = await window.xpertDesktop.openPlatform(result.target)
        else {
          const state = await invoke('state')
          const url = platformCommandUrl(state.config.webUrl, result.target)
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer')
            opened = true
          }
        }
        if (!opened) throw new Error(t('Could not open the connection page. Please retry.'))
        setAttempt(result.attemptId)
      } else {
        const next = await invoke('bosiChoose', {
          revision: catalog.revision,
          kind: item.kind,
          id: item.id,
          selected: !item.selected
        })
        if (alive.current) setCatalog(next)
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : t('Could not update capabilities.'))
    } finally {
      mutation.current = false
      if (alive.current) setBusy('')
    }
  }
  const statusLabel = (item: BosiOnboardingItem) => {
    if (item.status === 'expired') return t('Connection expired')
    if (item.status === 'requires_auth') return t('Authorization required')
    if (item.status === 'ready') return t(item.kind === 'connector' ? 'Connected' : 'Ready to use')
    if (item.status === 'configuration_required') return t('Administrator setup required')
    if (item.status === 'unavailable') return t('Unavailable')
    return t('Provided by your organization')
  }
  const available = catalog?.items.filter((item) => item.canSelect || item.canConnect || item.selected) ?? []
  const unavailable = catalog?.items.filter((item) => !item.canSelect && !item.canConnect && !item.selected) ?? []
  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{t('Capabilities and services')}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('Refresh')}
          disabled={loading || !!busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t('Loading…')}
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" disabled={loading || !!busy} onClick={() => void refresh()}>
            {t('Retry')}
          </Button>
        </div>
      )}
      {available.length > 0 && (
        <div className="max-h-80 divide-y overflow-auto rounded-2xl border">
          {available.map((item) => (
            <div key={`${item.kind}:${item.id}`} className="flex items-center gap-3 p-4">
              {item.icon?.type === 'image' ? (
                <img src={item.icon.value} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
              ) : (
                <Plug className="size-6 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                {item.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{item.reason || statusLabel(item)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.canConnect && item.status !== 'ready' && (
                  <Button size="sm" variant="outline" disabled={!!busy || loading} onClick={() => void act(item, true)}>
                    {t(item.status === 'expired' ? 'Reconnect' : 'Connect account')}
                  </Button>
                )}
                {(item.canSelect || item.selected) && (
                  <Button
                    size="sm"
                    variant={item.selected ? 'secondary' : 'outline'}
                    aria-pressed={item.selected}
                    aria-label={`${t('Use capability')}: ${item.name}`}
                    disabled={!!busy || loading}
                    onClick={() => void act(item, false)}
                  >
                    {busy === `${item.kind}:${item.id}` ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : item.selected ? (
                      <Check className="size-4" />
                    ) : null}
                    {t(item.selected ? 'Selected' : 'Enable')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && catalog && !available.length && (
        <p className="text-sm text-muted-foreground">{t('You can start using Bosi now and add capabilities later.')}</p>
      )}
      {!!unavailable.length && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t('Some capabilities need administrator setup')}</summary>
          <ul className="mt-3 space-y-2">
            {unavailable.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                {item.name} · {item.reason || statusLabel(item)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {attempt && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t('Complete authorization in your browser. You can continue and connect later.')}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          'Connections are saved in your Bosi workspace. Sharing this workspace can also share access to connected services.'
        )}
      </p>
      <Button className="h-12 w-full rounded-full" disabled={!!busy} onClick={onContinue}>
        {t('Continue')}
      </Button>
      <Button variant="ghost" className="w-full" disabled={!!busy} onClick={onContinue}>
        {t('Set up later')}
      </Button>
    </div>
  )
}
