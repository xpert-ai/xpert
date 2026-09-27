import { useEffect, useRef, useState } from 'react'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import type { ProfileViewSession } from '../assistant-profile-types'
import { invoke } from '../host'
import { t, useLocale, getLocale } from '../i18n'
import { localizedText } from '../../electron/i18n/index.mjs'
import { ProfileError, ProfileLoading } from './ProfileState'
import { remoteTheme } from './remote-theme'
import { PROFILE_CHANNEL, interactionHeld, isProfileMessage, navigationUrl } from './remote-protocol'
import { SchemaProfileView } from './SchemaProfileView'

export function RemoteProfileView({
  botId,
  manifest,
  active,
  onBusy,
  onClose
}: {
  botId: string
  manifest: XpertExtensionViewManifest
  active: boolean
  onBusy: (key: string, busy: boolean) => void
  onClose: () => void
}) {
  const locale = useLocale()
  const frame = useRef<HTMLIFrameElement>(null)
  const callbacks = useRef({ onBusy, onClose })
  callbacks.current = { onBusy, onClose }
  const visible = useRef(active)
  visible.current = active
  const [session, setSession] = useState<ProfileViewSession>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const instanceId = useRef(crypto.randomUUID())
  useEffect(() => {
    let disposed = false
    let opened: ProfileViewSession | undefined
    setError('')
    setSession(undefined)
    setReady(false)
    instanceId.current = crypto.randomUUID()
    invoke('openProfileView', { botId, viewKey: manifest.key }).then(
      (value) => {
        opened = value
        if (disposed) void invoke('closeProfileView', value.sessionId)
        else setSession(value)
      },
      (error: Error) => {
        if (!disposed) setError(error.message)
      }
    )
    return () => {
      disposed = true
      callbacks.current.onBusy(manifest.key, false)
      if (opened) void invoke('closeProfileView', opened.sessionId).catch(() => undefined)
    }
  }, [botId, manifest.key, retry])
  useEffect(() => {
    if (!session?.entryUrl) return
    let disposed = false
    let initialized = false
    let pending = 0
    let held = false
    const requests = new Set<string>()
    const instance = instanceId.current
    const busy = () => callbacks.current.onBusy(manifest.key, held || pending > 0)
    const send = (type: string, body: object) => {
      if (!disposed)
        frame.current?.contentWindow?.postMessage(
          { channel: PROFILE_CHANNEL, protocolVersion: 1, instanceId: instance, type, ...body },
          '*'
        )
    }
    const init = () =>
      send('init', {
        manifest: session.manifest,
        payload: {},
        initialQuery: {},
        runtimeScope: null,
        locale: getLocale(),
        theme: remoteTheme(),
        active: visible.current,
        debug: { enabled: false }
      })
    const timer = window.setTimeout(() => {
      if (!initialized) setError(t('The custom view took too long to load.'))
    }, 15000)
    const listener = async (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || !isProfileMessage(event.data)) return
      const message = event.data
      if (message.type === 'ready') {
        if (!initialized) {
          initialized = true
          clearTimeout(timer)
          setReady(true)
          setError('')
          init()
        }
        return
      }
      if (!initialized || message.instanceId !== instance) return
      if (message.type === 'notify') {
        if (visible.current) setNotice(message.message || '')
        return
      }
      if (message.type === 'resize') return
      if (!message.requestId || requests.has(message.requestId)) return
      // Hidden tabs retain their UI state but cannot act in the background.
      if (!visible.current) {
        send('error', { requestId: message.requestId, message: t('Open this view before interacting with it.') })
        return
      }
      if (requests.size >= 8) {
        send('error', { requestId: message.requestId, message: t('Please wait for the current operation.') })
        return
      }
      const action = message.type === 'executeAction'
      requests.add(message.requestId)
      if (action) {
        pending++
        busy()
      }
      try {
        let result: unknown
        let response = ''
        if (message.type === 'requestData') {
          response = 'data'
          result = await invoke('profileViewRequest', {
            sessionId: session.sessionId,
            operation: 'data',
            query: message.query
          })
        } else if (message.type === 'requestParameterOptions') {
          response = 'parameterOptions'
          result = await invoke('profileViewRequest', {
            sessionId: session.sessionId,
            operation: 'options',
            parameterKey: message.parameterKey,
            query: message.query
          })
        } else if (action) {
          response = 'actionResult'
          result = await invoke('profileViewRequest', {
            sessionId: session.sessionId,
            operation: 'action',
            actionKey: message.actionKey,
            targetId: message.targetId,
            input: message.input,
            parameters: message.parameters
          })
        } else if (message.type === 'invokeClientCommand') {
          response = 'clientCommandResult'
          const declared = session.manifest.clientCommands?.some((command) => command.key === message.commandKey)
          if (!declared) throw new Error(t('This profile operation is not available.'))
          // Acquire the interaction lock before yielding, so pointer leave cannot unmount a form.
          if (message.commandKey === 'assistant.profile.interaction') {
            held = interactionHeld(message.payload)
            busy()
            result = { success: true }
          } else if (message.commandKey === 'assistant.profile.close') {
            result = { success: !held && pending === 0 }
            send(response, { requestId: message.requestId, result })
            if (!held && pending === 0) callbacks.current.onClose()
            return
          } else {
            result = await invoke('profileViewRequest', {
              sessionId: session.sessionId,
              operation: 'command',
              commandKey: message.commandKey,
              payload: message.payload
            })
            const url = navigationUrl(result)
            if (url && !disposed) {
              window.open(url, '_blank', 'noopener,noreferrer')
              result = { success: true, status: 'opened', external: true }
            }
          }
        } else throw new Error(t('This profile operation is not available.'))
        send(response, { requestId: message.requestId, [response === 'data' ? 'data' : 'result']: result })
      } catch (error) {
        send('error', {
          requestId: message.requestId,
          message: error instanceof Error ? error.message : t('The operation failed. Please retry.')
        })
      } finally {
        requests.delete(message.requestId)
        if (action) {
          pending--
          if (!disposed) busy()
        }
      }
    }
    window.addEventListener('message', listener)
    const observer = new MutationObserver(() => {
      if (initialized) init()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'lang'] })
    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('message', listener)
    }
  }, [session, manifest.key])
  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        { channel: PROFILE_CHANNEL, protocolVersion: 1, instanceId: instanceId.current, type: 'viewActive', active },
        '*'
      )
  }, [active, ready])
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {notice && (
        <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <div className="p-3">
          <ProfileError message={error} retry={() => setRetry((value) => value + 1)} />
        </div>
      )}
      {!session && !error && <ProfileLoading />}
      {session?.entryUrl ? (
        <>
          {!ready && !error && (
            <div className="absolute inset-0 bg-background">
              <ProfileLoading />
            </div>
          )}
          <iframe
            ref={frame}
            src={session.entryUrl}
            title={localizedText(manifest.title, locale)}
            sandbox="allow-scripts allow-forms allow-downloads"
            referrerPolicy="no-referrer"
            className="h-full min-h-0 w-full flex-1 border-0"
          />
        </>
      ) : (
        session && <SchemaProfileView session={session} active={active} />
      )}
    </div>
  )
}
