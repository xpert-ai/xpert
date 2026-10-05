import { useWorkspaceConnection } from './WorkspaceConnection'
import { apiRootUrl } from '../electron/connection/urls.mjs'
import { useDeliveredFile } from './files/DeliveredFile'
import { createWorkbenchHandler } from './workbench'
import { useShellIntegration } from './shell/useShellIntegration'
import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import '@xpert-ai/chatkit-web-component'
import type { ChatKitOptions, XpertAIChatKit } from '@xpert-ai/chatkit-types'
import { Button } from '@xpert-ai/shadcn-ui'
import { LoaderCircle } from 'lucide-react'
import { invoke } from './host'
import { getChatKitMessagePresentation, getChatKitTheme } from './theme'
import type { Bot, ConnectionConfig } from './types'
import { AssistantAppearanceDialog } from './avatar/AssistantAppearanceDialog'

// A thin React lifecycle adapter; ChatKit owns every conversation interaction.
export function ChatPanel({
  bot,
  config,
  dark,
  initialThread,
  onConversationRead,
  onAppearanceSaved
}: {
  bot: Bot
  config: ConnectionConfig
  dark: boolean
  initialThread: string | null
  onConversationRead: (botId: string, threadId: string | null) => void
  onAppearanceSaved: () => Promise<void>
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<XpertAIChatKit | null>(null)
  const optionsRef = useRef<ChatKitOptions | null>(null)
  // The frame load event precedes ChatKit's own session/data loading state.
  const [frameReady, setFrameReady] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [customizeId, setCustomizeId] = useState<string | null>(null)
  const delivery = useDeliveredFile()
  const deliveryRef = useRef(delivery.open)
  deliveryRef.current = delivery.open
  const shell = useShellIntegration(`${config.apiUrl}:${bot.id}`)
  const openLocalComputer = useRef(shell.openComputer)
  openLocalComputer.current = shell.openComputer
  // View APIs and navigation use the public key, including the provider namespace.
  const computers = { cloud: { viewKey: 'ProComputer__pro-computer' }, local: shell.computer }
  const computerState = JSON.stringify(computers)
  const previousComputerState = useRef(computerState)
  const [shellAssistantId, setShellAssistantId] = useState(bot.assistantId || bot.id)
  const [threadId, setThreadId] = useState<string | null>(initialThread)
  const connection = useWorkspaceConnection(config.webUrl, shellAssistantId)
  const connectRef = useRef(connection.connect)
  connectRef.current = connection.connect

  useEffect(() => {
    const node = document.createElement('xpertai-chatkit')
    const element = node as XpertAIChatKit
    let disposed = false
    let activeThread = threadId
    let activeAssistant = bot.assistantId || bot.id
    setShellAssistantId(bot.assistantId || bot.id)
    setFrameReady(false)
    setError('')
    const header = {
      enabled: true,
      windowDrag: !!window.xpertDesktop,
      title: { text: bot.name },
      character: { enabled: true, customizable: true, computers }
    }
    const workbench = {
      enabled: true,
      viewRail: { enabled: true },
      onClientCommand: createWorkbenchHandler(bot.id, config.webUrl, (session) => {
        if (!disposed) {
          activeAssistant = session.assistantId
          activeThread = session.threadId
          setShellAssistantId(session.assistantId)
          setThreadId(session.threadId)
        }
      })
    }
    const options: ChatKitOptions = {
      ...shell.handlers,
      frameUrl: config.frameUrl,
      displayMode: 'chat',
      pet: false,
      api: {
        apiUrl: `${apiRootUrl(config.apiUrl)}/api/ai`,
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
      messagePresentation: getChatKitMessagePresentation(config.appearance),
      layout: { maxWidth: 960 },
      initialThread: threadId,
      header,
      history: { enabled: true },
      taskSummary: { enabled: true },
      composer: {
        attachments: { enabled: true, maxCount: 5, maxSize: 50 * 1024 * 1024 },
        resources: { enabled: true, onConnect: (request) => connectRef.current(request) },
        connectors: { enabled: true }
      },
      workbench,
      toolOutputAttachments: {
        onRequestPreview: ({ attachment }) => invoke('toolOutputPreview', attachment)
      },
      request: {
        context: { source: 'desktop' }
      }
    }
    element.setOptions(options)
    optionsRef.current = options
    element.addEventListener('chatkit.ready', () => {
      if (!disposed) {
        setFrameReady(true)
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
    element.addEventListener('chatkit.effect', (event) => {
      if (disposed) return
      const { name, data } = event.detail
      if (
        name === 'assistant.customize' &&
        data &&
        typeof data === 'object' &&
        'assistantId' in data &&
        data.assistantId === activeAssistant
      )
        setCustomizeId(activeAssistant)
      else if (
        name === 'assistant.computer.open' &&
        data &&
        typeof data === 'object' &&
        'assistantId' in data &&
        data.assistantId === activeAssistant &&
        'kind' in data &&
        data.kind === 'local'
      )
        openLocalComputer.current()
      else deliveryRef.current(event.detail)
    })
    const read = () => {
      if (!disposed && activeAssistant === (bot.assistantId || bot.id)) onConversationRead(bot.id, activeThread)
    }
    element.addEventListener('chatkit.thread.load.end', read)
    element.addEventListener('chatkit.response.end', read)
    // StrictMode's discarded effect must not start an iframe navigation.
    queueMicrotask(() => {
      if (disposed) return
      container.current?.appendChild(node)
      instance.current = element
    })
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
  }, [bot.id, config.apiUrl, config.frameUrl, config.webUrl, retry])

  useEffect(() => {
    if (frameReady && instance.current && optionsRef.current) {
      const theme = getChatKitTheme(dark, config.appearance)
      const messagePresentation = getChatKitMessagePresentation(config.appearance)
      if (
        JSON.stringify(optionsRef.current.theme) === JSON.stringify(theme) &&
        JSON.stringify(optionsRef.current.messagePresentation) === JSON.stringify(messagePresentation) &&
        optionsRef.current.locale === config.locale &&
        optionsRef.current.header?.title?.text === bot.name &&
        previousComputerState.current === computerState
      )
        return
      previousComputerState.current = computerState
      const options = {
        ...optionsRef.current,
        theme,
        messagePresentation,
        locale: config.locale,
        header: {
          ...optionsRef.current.header,
          title: { text: bot.name },
          character: { enabled: true, customizable: true, computers }
        }
      }
      optionsRef.current = options
      instance.current.setOptions(options)
    }
  }, [dark, frameReady, config.appearance, config.locale, bot.name, computerState])

  return (
    <section
      aria-label={t('Chat with {{name}}', { name: bot.name })}
      className="relative flex h-full min-w-0 flex-1 flex-col bg-background"
    >
      {connection.status}
      {delivery.dialog}
      {shell.dialog}
      {customizeId && (
        <AssistantAppearanceDialog
          botId={customizeId}
          onClose={() => setCustomizeId(null)}
          onSaved={async () => {
            await onAppearanceSaved()
            if (optionsRef.current) instance.current?.setOptions(optionsRef.current)
          }}
        />
      )}
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
      {!frameReady && !error && (
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
