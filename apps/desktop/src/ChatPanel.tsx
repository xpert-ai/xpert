import { ShellControls } from './ShellControls'
import { t } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import '@xpert-ai/chatkit-web-component'
import type { ChatKitOptions, XpertAIChatKit } from '@xpert-ai/chatkit-types'
import { Button } from '@xpert-ai/shadcn-ui'
import { LoaderCircle } from 'lucide-react'
import { invoke } from './host'
import { getChatKitTheme } from './theme'
import type { Bot, ConnectionConfig } from './types'

// A thin React lifecycle adapter; ChatKit owns every conversation interaction.
export function ChatPanel({
  bot,
  config,
  dark,
  initialThread,
  onConversationRead
}: {
  bot: Bot
  config: ConnectionConfig
  dark: boolean
  initialThread: string | null
  onConversationRead: (botId: string, threadId: string | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<XpertAIChatKit | null>(null)
  const optionsRef = useRef<ChatKitOptions | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const grantRef = useRef<string | null>(null)
  const onGrant = useCallback((id: string | null) => {
    grantRef.current = id
    if (instance.current && optionsRef.current) {
      const next = {
        ...optionsRef.current,
        request: { context: { source: 'desktop', ...(id ? { desktopShellGrantId: id } : {}) } }
      }
      optionsRef.current = next
      instance.current.setOptions(next)
    }
  }, [])
  const [threadId, setThreadId] = useState<string | null>(initialThread)

  useEffect(() => {
    const node = document.createElement('xpertai-chatkit')
    const element = node as XpertAIChatKit
    let disposed = false
    let activeThread = threadId
    setReady(false)
    setError('')
    const options: ChatKitOptions = {
      frameUrl: config.frameUrl,
      api: {
        apiUrl: `${config.apiUrl}/api/ai`,
        xpertId: bot.assistantId || bot.id,
        getClientSecret: async () => {
          try {
            return await invoke('chatSession', bot.id)
          } catch (error) {
            if (!disposed) setError(error instanceof Error ? error.message : t('Could not create a chat session.'))
            throw error
          }
        }
      },
      locale: config.locale,
      theme: getChatKitTheme(document.documentElement.classList.contains('dark'), config.appearance),
      layout: { maxWidth: 960 },
      initialThread: threadId,
      header: { enabled: true, title: { text: bot.name } },
      history: { enabled: true },
      composer: {
        attachments: { enabled: true, maxCount: 5, maxSize: 50 * 1024 * 1024 },
        resources: { enabled: true },
        connectors: { enabled: true }
      },
      workbench: { enabled: true },
      request: {
        context: { source: 'desktop', ...(grantRef.current ? { desktopShellGrantId: grantRef.current } : {}) }
      }
    }
    element.setOptions(options)
    optionsRef.current = options
    element.addEventListener('chatkit.ready', () => {
      if (!disposed) {
        setReady(true)
        setError('')
      }
    })
    element.addEventListener('chatkit.error', (event) => {
      if (!disposed)
        setError(event.detail.error.message || t('ChatKit could not connect. Check your connection settings.'))
    })
    element.addEventListener('chatkit.thread.change', (event) => {
      if (!disposed) {
        activeThread = event.detail.threadId
        setThreadId(event.detail.threadId)
      }
    })
    const read = () => {
      if (!disposed) onConversationRead(bot.id, activeThread)
    }
    element.addEventListener('chatkit.thread.load.end', read)
    element.addEventListener('chatkit.response.end', read)
    container.current?.appendChild(node)
    instance.current = element
    const timer = window.setTimeout(() => {
      if (!disposed) setError(t('ChatKit took too long to load. Check the ChatKit URL and retry.'))
    }, 30000)
    element.addEventListener('chatkit.ready', () => window.clearTimeout(timer))
    return () => {
      disposed = true
      window.clearTimeout(timer)
      element.remove()
      instance.current = null
    }
    // Remount only for a binding change or explicit retry; thread changes belong to ChatKit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id, config.apiUrl, config.frameUrl, retry])

  useEffect(() => {
    if (ready && instance.current && optionsRef.current) {
      const options = {
        ...optionsRef.current,
        theme: getChatKitTheme(dark, config.appearance),
        locale: config.locale,
        header: { enabled: true, title: { text: bot.name } }
      }
      optionsRef.current = options
      instance.current.setOptions(options)
    }
  }, [dark, ready, config.appearance, config.locale, bot.name])

  return (
    <section
      aria-label={t('Chat with {{name}}', { name: bot.name })}
      className="relative flex h-full min-w-0 flex-1 flex-col bg-background"
    >
      <ShellControls assistantId={bot.assistantId || bot.id} threadId={threadId} onGrant={onGrant} />
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-3 border-b bg-destructive/5 px-6 py-3 text-sm text-destructive"
        >
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>
            {t('Reconnect')}
          </Button>
        </div>
      )}
      {!ready && !error && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          {t('Connecting to {{name}}…', { name: bot.name })}
        </div>
      )}
      <div ref={container} className="min-h-0 flex-1" />
    </section>
  )
}
