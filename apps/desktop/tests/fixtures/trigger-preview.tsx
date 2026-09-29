// Development fixture only. No real credentials, network mutations, or production fallback data.
import { createRoot } from 'react-dom/client'
import { StrictMode, useRef, useState } from 'react'
import type { AssistantTriggerMutation, AssistantTriggerProvider, AssistantTriggerSettings } from '@xpert-ai/contracts'
import { AssistantPreview } from '../../src/AssistantPreview'
import type { AssistantRow } from '../../src/assistant-list-model'
import { AssistantPreviewScope } from '../../src/profile/PreviewScope'
import { ProfilePanel } from '../../src/profile/ProfilePanel'
import { setLocale } from '../../src/i18n'
import { applyDesktopTheme } from '../../src/theme'
import { defaultAppearance } from '../../src/appearance-types'
import { installShadcnThemeVars } from '../../src/ui'
import '../../src/styles.css'

const url = new URL(location.href)
setLocale(url.searchParams.get('locale') || 'en')
const dark = url.searchParams.has('dark')
installShadcnThemeVars()
document.documentElement.classList.toggle('dark', dark)
applyDesktopTheme(defaultAppearance(), dark)
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const providers: AssistantTriggerProvider[] = [
  {
    name: 'telegram',
    label: label('Telegram', 'Telegram'),
    available: true,
    schema: {
      type: 'object',
      required: ['enabled', 'integrationId'],
      properties: {
        enabled: { type: 'boolean', default: true },
        integrationId: {
          type: 'string',
          title: label('Telegram account', 'Telegram 账号'),
          'x-ui': { selectUrl: '/api/integration/select-options?provider=telegram' }
        },
        directMessages: { type: 'boolean', default: true, title: label('Receive direct messages', '接收私聊消息') },
        mentions: {
          type: 'boolean',
          default: true,
          title: label('Respond to @mentions in groups', '响应群聊中的 @提及')
        },
        replies: { type: 'boolean', default: true, title: label('Respond to replies', '响应回复') },
        allGroupMessages: {
          type: 'boolean',
          default: false,
          title: label('Receive all group messages', '接收所有群聊消息')
        }
      }
    }
  },
  {
    name: 'linear',
    label: label('Linear', 'Linear'),
    available: true,
    schema: {
      type: 'object',
      required: ['enabled', 'connectorId'],
      properties: {
        enabled: { type: 'boolean', default: true },
        connectorId: {
          type: 'string',
          title: label('Linear workspace', 'Linear 工作空间'),
          'x-ui': { selectUrl: '/api/connector/select-options?provider=linear' }
        },
        mentions: { type: 'boolean', default: true, title: label('Respond to mentions', '响应提及') },
        assignedIssues: {
          type: 'boolean',
          default: true,
          title: label('Respond to assigned issues', '响应分配的 Issue')
        }
      }
    }
  },
  {
    name: 'lark',
    label: label('Feishu', '飞书'),
    available: true,
    quickConnect: { method: 'qr', integrationProvider: 'lark', configField: 'integrationId' },
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        integrationId: { type: 'string' },
        selectedUsers: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'schedule',
    label: label('Schedule', '定时计划'),
    available: true,
    schema: {
      type: 'object',
      required: ['enabled', 'cron', 'task'],
      properties: {
        enabled: { type: 'boolean', default: true },
        cron: {
          type: 'string',
          default: '0 8 * * 1-5',
          title: label('Cron expression (server time)', 'Cron 表达式（服务器时间）')
        },
        task: { type: 'string', title: label('Task', '任务') }
      }
    }
  }
]
let data: AssistantTriggerSettings = {
  revision: 'a'.repeat(64),
  canEdit: !url.searchParams.has('readonly'),
  providers,
  items: url.searchParams.has('empty')
    ? []
    : [
        {
          key: 'telegram',
          provider: 'telegram',
          title: 'Telegram',
          enabled: true,
          config: {
            enabled: true,
            integrationId: 'demo-telegram',
            directMessages: true,
            mentions: true,
            replies: true
          },
          lastActivityAt: '2026-09-29T08:30:00Z',
          lastRunAt: '2026-09-29T08:00:00Z',
          connection: 'connected'
        },
        {
          key: 'linear',
          provider: 'linear',
          title: 'Linear',
          enabled: true,
          config: { enabled: true, connectorId: 'demo-linear', mentions: true, assignedIssues: true },
          lastActivityAt: null,
          lastRunAt: null,
          connection: 'connected'
        },
        {
          key: 'schedule',
          provider: 'schedule',
          title: 'Daily project briefing',
          enabled: true,
          config: {
            enabled: true,
            cron: '0 8 * * 1-5',
            task: 'Summarize project progress',
            additionalInstructions: 'Summarize project progress and share the key blockers.'
          },
          lastActivityAt: '2026-09-29T00:00:00Z',
          lastRunAt: '2026-09-29T00:00:00Z',
          connection: 'unknown'
        }
      ]
}
let qrStarting = false
let qrAttempts = 0
let qrPolls = 0
let qrCompletions = 0
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  if (input !== '/__desktop') return originalFetch(input, init)
  const { method, argument } = JSON.parse(String(init?.body)) as {
    method: string
    argument: { change: AssistantTriggerMutation; provider?: string }
  }
  let value: unknown
  if (method === 'assistantTriggers') {
    if (url.searchParams.has('error')) return Response.json({ ok: false, message: 'Preview load failure', status: 503 })
    value = data
  } else if (method === 'beginAssistantTriggerQr') {
    // Match the real server: overlapping begins for the same assistant hit a session lock.
    if (qrStarting)
      return Response.json({ ok: false, message: 'Authorization is busy. Please retry shortly.', status: 409 })
    qrStarting = true
    await new Promise((resolve) => setTimeout(resolve, 100))
    qrStarting = false
    qrAttempts++
    qrPolls = 0
    if (url.searchParams.has('qr-delay')) await new Promise((resolve) => setTimeout(resolve, 600))
    value = {
      id: `qr-${qrAttempts}`,
      authorizationUrl: 'https://open.feishu.cn/page/cli?user_code=preview',
      expiresAt: Date.now() + (url.searchParams.has('qr-expired') && qrAttempts === 1 ? 500 : 60000),
      intervalSeconds: 2
    }
  } else if (method === 'pollAssistantTriggerQr') {
    qrPolls++
    value = {
      status: url.searchParams.has('qr-denied')
        ? 'denied'
        : url.searchParams.has('qr-waiting') || qrPolls === 1
          ? 'waiting'
          : 'authorized'
    }
  } else if (method === 'completeAssistantTriggerQr') {
    qrCompletions++
    if (url.searchParams.has('qr-retry') && qrCompletions === 1)
      return Response.json({ ok: false, message: 'QR connection failed. Please retry.', status: 503 })
    data.items.push({
      key: 'lark',
      provider: 'lark',
      title: 'Feishu',
      enabled: true,
      config: { enabled: true, integrationId: 'demo-feishu' },
      connection: 'connected',
      lastActivityAt: null,
      lastRunAt: null
    })
    data = { ...data, revision: String(data.items.length).repeat(64) }
    value = { provider: 'lark', enabled: true, connected: true, state: 'connected' }
  } else if (method === 'cancelAssistantTriggerQr') value = undefined
  else if (method === 'assistantTriggerOptions')
    value = [
      { value: 'demo-telegram', label: '@ClawXpertBot', disabled: false },
      { value: 'demo-linear', label: 'XpertAI Workspace', disabled: false },
      { value: 'demo-feishu', label: 'Feishu Test Bot', disabled: false }
    ]
  else if (method === 'validateAssistantTrigger') value = { valid: true }
  else if (method === 'saveAssistantTrigger') {
    const change = argument.change
    if (change.revision !== data.revision || url.searchParams.has('conflict'))
      return Response.json({ ok: false, message: 'This trigger changed. Reload before saving again.', status: 409 })
    if (change.operation === 'delete') data.items = data.items.filter((item) => item.provider !== change.provider)
    else if (change.operation === 'toggle')
      data.items = data.items.map((item) =>
        item.provider === change.provider
          ? { ...item, enabled: change.enabled, config: { ...item.config, enabled: change.enabled } }
          : item
      )
    else {
      const provider = providers.find((provider) => provider.name === change.provider)!
      data.items = [
        ...data.items.filter((item) => item.provider !== change.provider),
        {
          key: change.provider,
          provider: change.provider,
          title: change.title,
          config: change.config,
          enabled: change.config.enabled !== false,
          connection: ['telegram', 'linear'].includes(provider.name) ? 'connected' : 'unknown',
          lastActivityAt: null,
          lastRunAt: null
        }
      ]
    }
    data = { ...data, revision: crypto.randomUUID().replaceAll('-', '').repeat(2) }
    value = { saved: true }
  } else if (method === 'botProfile')
    value = {
      id: 'preview',
      name: 'ClawXpert',
      description: 'A coding and analysis expert.',
      workspace: { id: 'demo', name: 'XpertAI Workspace' },
      version: '1.0',
      indicators: { skillCount: 6, toolCount: 12, subAgentCount: 2 }
    }
  else if (method === 'botProfileViews') value = []
  else if (method === 'botConversations') value = { items: [], total: 0 }
  else value = {}
  return Response.json({ ok: true, value })
}
const row: AssistantRow = {
  bot: {
    id: 'preview',
    name: 'ClawXpert',
    description: 'A coding and analysis expert.',
    avatarUrl: null,
    avatarEmoji: { id: 'lobster', unified: '1f99e' }
  },
  subtitle: '',
  unread: false,
  activity: undefined,
  preference: undefined
}
function Preview() {
  const [busy, setBusy] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  if (url.searchParams.has('floating'))
    return (
      <AssistantPreviewScope>
        <main className="flex h-full items-center bg-background p-4 text-foreground">
          <div ref={anchor} className="w-48">
            <AssistantPreview row={row} anchorRef={anchor} onSelect={() => {}} onEdit={() => {}}>
              <button type="button">Preview ClawXpert</button>
            </AssistantPreview>
          </div>
        </main>
      </AssistantPreviewScope>
    )
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-background p-4 text-foreground">
      <p className="text-xs text-muted-foreground">Bosi · UI fixture · {busy ? 'Editing' : 'Ready'}</p>
      <div className="flex h-[600px] max-h-[calc(100vh-80px)] w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
        <ProfilePanel
          row={row}
          pinned
          onPin={() => {}}
          onClose={() => {}}
          onBusy={setBusy}
          onSelect={() => {}}
          onEdit={() => {}}
        />
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  url.searchParams.has('strict') ? (
    <StrictMode>
      <Preview />
    </StrictMode>
  ) : (
    <Preview />
  )
)
