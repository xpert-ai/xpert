import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import QRCode from 'qrcode'
import type { TIntegrationQrSession } from '@xpert-ai/contracts'
import { Button } from '../../ui'
import { HostError, invoke } from '../../host'
import { t } from '../../i18n'

type State = 'loading' | 'waiting' | 'activating' | 'expired' | 'denied' | 'failed'

export function TriggerQrConnect({
  botId,
  provider,
  onBusy,
  onConnected
}: {
  botId: string
  provider: string
  onBusy: (busy: boolean) => void
  onConnected: () => void
}) {
  const [state, setState] = useState<State>('loading')
  const [qrImage, setQrImage] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const retryActivation = useRef<(() => void) | null>(null)
  // Parent callbacks may change on render; a QR session belongs only to its account/provider/attempt.
  const callbacks = useRef({ onBusy, onConnected })
  callbacks.current = { onBusy, onConnected }

  useEffect(() => {
    let alive = true
    let completed = false
    let activating = false
    let session: TIntegrationQrSession | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let expiry: ReturnType<typeof setTimeout> | undefined
    retryActivation.current = null
    setState('loading')
    setError('')
    setQrImage('')
    const args = () => ({ botId, provider, session: session!.id })
    const cancel = () => session && void invoke('cancelAssistantTriggerQr', args()).catch(() => undefined)
    const expire = () => {
      clearTimeout(timer)
      retryActivation.current = null
      setState('expired')
    }
    const fail = (error: unknown) => {
      setError(error instanceof Error ? error.message : t('QR connection failed. Please retry.'))
      setState('failed')
    }
    const activate = async () => {
      if (!alive || activating || !session) return
      activating = true
      clearTimeout(expiry)
      setState('activating')
      setError('')
      callbacks.current.onBusy(true)
      try {
        const result = await invoke('completeAssistantTriggerQr', args())
        if (!alive) return
        if (!result.connected) throw new Error(t('QR connection failed. Please retry.'))
        completed = true
        callbacks.current.onConnected()
      } catch (error) {
        if (alive) {
          if (Date.now() >= session.expiresAt || (error instanceof HostError && [404, 410].includes(error.status)))
            expire()
          else fail(error)
        }
      } finally {
        activating = false
        if (alive) callbacks.current.onBusy(false)
      }
    }
    const poll = async () => {
      if (!alive || !session) return
      if (Date.now() >= session.expiresAt) return expire()
      try {
        const result = await invoke('pollAssistantTriggerQr', args())
        if (!alive) return
        if (Date.now() >= session.expiresAt) return expire()
        if (result.status === 'authorized') {
          retryActivation.current = () => void activate()
          await activate()
        } else if (result.status === 'waiting') {
          timer = setTimeout(() => void poll(), Math.max(2, session.intervalSeconds) * 1000)
        } else {
          clearTimeout(expiry)
          setState(result.status)
        }
      } catch (error) {
        if (alive) {
          clearTimeout(expiry)
          fail(error)
        }
      }
    }
    void (async () => {
      // StrictMode discards its first effect synchronously. Do not create a server session for it.
      await Promise.resolve()
      if (!alive) return
      try {
        session = await invoke('beginAssistantTriggerQr', { botId, provider })
        if (!alive) return cancel()
        const image = await QRCode.toDataURL(session.authorizationUrl, { width: 220, margin: 2 })
        if (!alive) return
        setQrImage(image)
        setState('waiting')
        expiry = setTimeout(expire, Math.max(0, session.expiresAt - Date.now()))
        timer = setTimeout(() => void poll(), Math.max(2, session.intervalSeconds) * 1000)
      } catch (error) {
        if (alive) fail(error)
      }
    })()
    return () => {
      alive = false
      clearTimeout(timer)
      clearTimeout(expiry)
      retryActivation.current = null
      if (!completed && !activating) cancel()
    }
  }, [botId, provider, attempt])

  return (
    <div className="flex min-h-72 flex-col items-center gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        {t(
          'Scan with the app to authorize. Your assistant will connect using the provider’s default response settings.'
        )}
      </p>
      {state === 'waiting' && <img src={qrImage} width={220} height={220} alt={t('Channel authorization QR code')} />}
      {(state === 'loading' || state === 'activating') && (
        <LoaderCircle className="my-6 size-8 animate-spin text-primary" />
      )}
      <p role="status" className="text-sm">
        {t(
          {
            loading: 'Generating QR code…',
            waiting: 'Scan the QR code and confirm in the app.',
            activating: 'Authorized. Connecting your assistant…',
            expired: 'This QR code has expired.',
            denied: 'Authorization was declined.',
            failed: 'QR connection failed. Please retry.'
          }[state]
        )}
      </p>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {t(error)}
        </p>
      )}
      {['expired', 'denied', 'failed'].includes(state) && (
        <Button
          type="button"
          onClick={() => (retryActivation.current ? retryActivation.current() : setAttempt(attempt + 1))}
        >
          {t('Try again')}
        </Button>
      )}
    </div>
  )
}
