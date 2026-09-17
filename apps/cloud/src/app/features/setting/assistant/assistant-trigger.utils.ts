import { IconDefinition, TWorkflowTriggerMeta } from '../../../@core'
import { WORKFLOW_TRIGGER_INTEGRATIONS } from '@xpert-ai/contracts'
import { hasJsonSchemaRequiredErrors } from '../../../@shared/workflow'
import { WorkflowTriggerProviderOption, XpertDraftTriggerEditorItem } from '../../xpert/draft'

export interface AssistantTriggerCard {
  key: string
  provider: WorkflowTriggerProviderOption
  icon?: IconDefinition
  item?: XpertDraftTriggerEditorItem
  available: boolean
}

export function buildAssistantTriggerCards(
  providers: TWorkflowTriggerMeta[],
  items: XpertDraftTriggerEditorItem[]
): AssistantTriggerCard[] {
  const available = new Map(
    providers.filter((provider) => provider.name !== 'chat').map((provider) => [provider.name, provider])
  )
  const existing = new Set(items.map((item) => item.provider.name))
  return [
    ...items
      .filter((item) => item.provider.name !== 'chat')
      .map((item) => {
        const provider = available.get(item.provider.name)
        return {
          key: item.nodeKey,
          provider: provider ?? item.provider,
          icon: provider?.icon,
          item,
          available: !!provider
        }
      }),
    ...Array.from(available.values())
      .filter((provider) => !provider.deprecated && !existing.has(provider.name))
      .map((provider) => ({
        key: provider.name,
        provider,
        icon: provider.icon,
        available: true
      }))
  ]
}

export function mergeAssistantTrigger(
  items: XpertDraftTriggerEditorItem[],
  item: XpertDraftTriggerEditorItem
): XpertDraftTriggerEditorItem[] {
  return items.some((current) => current.nodeKey === item.nodeKey)
    ? items.map((current) => (current.nodeKey === item.nodeKey ? item : current))
    : [...items, item]
}

export function isAssistantTriggerConnected(card: AssistantTriggerCard): boolean {
  return (
    !!card.item?.config &&
    card.item.config.enabled !== false &&
    !hasJsonSchemaRequiredErrors(card.provider.configSchema, card.item.config)
  )
}

export function getAssistantTriggerIntegration(provider: WorkflowTriggerProviderOption) {
  return provider.integration ?? WORKFLOW_TRIGGER_INTEGRATIONS[provider.name]
}
