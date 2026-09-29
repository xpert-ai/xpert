import type {
  AssistantTriggerConfig,
  AssistantTriggerCategory,
  AssistantTriggerPresentation,
  AssistantTriggerItem as TriggerItem,
  AssistantTriggerProvider as TriggerProvider,
  AssistantTriggerSettings as TriggerSettings,
  JsonSchemaObjectType
} from '@xpert-ai/contracts'

export type { AssistantTriggerConfig }
export type AssistantTriggerProvider = TriggerProvider & { presentation: AssistantTriggerPresentation }
export type AssistantTriggerItem = TriggerItem & { category: AssistantTriggerCategory }
export type AssistantTriggerSettings = Omit<TriggerSettings, 'providers' | 'items'> & {
  providers: AssistantTriggerProvider[]
  items: AssistantTriggerItem[]
}
export type TriggerField = JsonSchemaObjectType['properties'][string]

// Bosi compatibility for providers without UI metadata. The platform does not own this catalog.
const ASSISTANT_TRIGGER_PRESENTATIONS: Readonly<Record<string, AssistantTriggerPresentation>> = {
  telegram: { category: 'channel', channel: 'telegram', accountFields: ['integrationId', 'connectorId'] },
  linear: { category: 'channel', channel: 'linear', accountFields: ['integrationId', 'connectorId'] },
  lark: { category: 'channel', channel: 'lark', accountFields: ['integrationId'] },
  wecom: { category: 'channel', channel: 'wecom', accountFields: ['integrationId'] },
  slack: { category: 'channel', channel: 'slack', accountFields: ['integrationId', 'connectorId'] },
  discord: { category: 'channel', channel: 'discord', accountFields: ['integrationId', 'connectorId'] },
  schedule: { category: 'automation', kind: 'schedule', instructionField: 'task' }
}

export function presentTriggerSettings(data: TriggerSettings): AssistantTriggerSettings {
  const presentation = (name: string): AssistantTriggerPresentation =>
    data.providers.find((provider) => provider.name === name)?.presentation ??
    (Object.hasOwn(ASSISTANT_TRIGGER_PRESENTATIONS, name) ? ASSISTANT_TRIGGER_PRESENTATIONS[name] : undefined) ?? {
      category: 'automation',
      kind: 'app-event'
    }
  return {
    ...data,
    providers: data.providers.map((provider) => ({ ...provider, presentation: presentation(provider.name) })),
    items: data.items.map((item) => ({ ...item, category: presentation(item.provider).category }))
  }
}
export const channelCatalog = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'linear', label: 'Linear' },
  { id: 'lark', label: 'Feishu' },
  { id: 'wecom', label: 'WeCom' },
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' }
] as const
export const automationKinds = [
  { id: 'schedule', label: 'Schedule', description: 'Run at a specific time or on a schedule.' },
  { id: 'app-event', label: 'App Event', description: 'Start when something happens in an app.' },
  { id: 'webhook', label: 'Webhook', description: 'Start when an HTTP request is received.' },
  { id: 'email', label: 'Email', description: 'Start when a new email is received.' }
] as const

export function channelProviders(providers: AssistantTriggerProvider[]): AssistantTriggerProvider[] {
  const connected = providers.filter((provider) => provider.presentation.category === 'channel')
  return [
    ...connected,
    ...channelCatalog
      .filter((channel) => !connected.some((provider) => provider.presentation.channel === channel.id))
      .map((channel) => ({
        name: channel.id,
        label: { en_US: channel.label },
        available: false,
        presentation: { category: 'channel' as const, channel: channel.id },
        schema: { type: 'object' as const, properties: {} }
      }))
  ]
}

export function initialConfig(provider: AssistantTriggerProvider, item?: AssistantTriggerItem): AssistantTriggerConfig {
  return {
    ...Object.fromEntries(
      Object.entries(provider.schema.properties)
        .filter(([, field]) => field.default !== undefined)
        .map(([key, field]) => [key, structuredClone(field.default)])
    ),
    ...item?.config,
    enabled: item?.enabled ?? true
  }
}

export function editableFields(provider: AssistantTriggerProvider) {
  return Object.entries(provider.schema.properties).filter(
    ([key]) => key !== 'enabled' && key !== 'additionalInstructions' && key !== provider.presentation.instructionField
  )
}

export function needsAdvancedEditor(provider: AssistantTriggerProvider) {
  return editableFields(provider).some(
    ([, field]) =>
      !('type' in field) ||
      !['string', 'number', 'integer', 'boolean'].includes(String(field.type)) ||
      field['x-ui']?.component === 'password' ||
      !!field['x-ui']?.visibleWhen ||
      (!!field['x-ui']?.selectUrl && !/^\/api\/(integration|connector)\/select-options\?/.test(field['x-ui'].selectUrl))
  )
}

export function triggerSummary(provider: AssistantTriggerProvider | undefined, item: AssistantTriggerItem) {
  if (!provider) return item.provider
  return editableFields(provider)
    .filter(([key]) => !provider.presentation.accountFields?.includes(key))
    .flatMap(([key, field]) => {
      const value = item.config[key]
      if (value === true) return [{ label: field.title, value: '' }]
      if (typeof value === 'string' && value) return [{ label: field.title, value }]
      return []
    })
    .slice(0, 3)
}
