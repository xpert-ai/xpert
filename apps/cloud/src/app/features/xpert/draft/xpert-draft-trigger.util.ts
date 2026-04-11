import {
  IWFNTrigger,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { WorkflowTriggerProviderOption } from './workflow-trigger-provider-option'

const TRIGGER_NODE_HORIZONTAL_OFFSET = 280
const TRIGGER_NODE_VERTICAL_GAP = 120

export const XPERT_DRAFT_PRIMARY_AGENT_NODE_MISSING = 'xpert-draft-primary-agent-node-missing'

export type XpertDraftTriggerEditorItem = {
  nodeKey: string
  provider: WorkflowTriggerProviderOption
  config?: Record<string, unknown> | null
}

export function readTriggerEditorItemsFromDraft(
  draft: TXpertTeamDraft | null | undefined,
  providers: WorkflowTriggerProviderOption[]
): XpertDraftTriggerEditorItem[] {
  const providerMap = new Map(providers.map((provider) => [provider.name, provider]))

  return (draft?.nodes ?? [])
    .filter(isWorkflowTriggerNode)
    .map((node) => {
      const trigger = node.entity as IWFNTrigger
      const providerName = `${trigger.from ?? 'chat'}`.trim() || 'chat'

      return {
        node,
        providerName,
        trigger
      }
    })
    .filter(({ providerName }) => providerName !== 'chat')
    .map(({ node, providerName, trigger }) => {
      const provider =
        providerMap.get(providerName) ??
        ({
          name: providerName,
          label: {
            en_US: providerName,
            zh_Hans: providerName
          }
        } satisfies WorkflowTriggerProviderOption)

      return {
        nodeKey: node.key,
        provider,
        config: cloneTriggerConfig(trigger.config)
      }
    })
}

export function upsertTriggerEditorItemsIntoDraft(
  draft: TXpertTeamDraft,
  items: XpertDraftTriggerEditorItem[]
): TXpertTeamDraft {
  const draftNodeKeys = new Set(draft.nodes.map((node) => node.key))
  const newItems = items.filter((item) => !draftNodeKeys.has(item.nodeKey))
  const primaryAgentNode = newItems.length ? getPrimaryAgentNodeFromDraft(draft) : null

  if (newItems.length && !primaryAgentNode) {
    throw new Error(XPERT_DRAFT_PRIMARY_AGENT_NODE_MISSING)
  }

  const configByNodeKey = new Map(items.map((item) => [item.nodeKey, cloneTriggerConfig(item.config)]))
  const nextNodes = draft.nodes.map((node) => {
    if (!isWorkflowTriggerNode(node) || !configByNodeKey.has(node.key)) {
      return node
    }

    return {
      ...node,
      entity: {
        ...node.entity,
        config: normalizeTriggerConfig(configByNodeKey.get(node.key))
      }
    }
  })

  const nextConnections = [...(draft.connections ?? [])]
  const existingEdgeKeys = new Set(
    nextConnections
      .filter((connection) => connection.type === 'edge')
      .map((connection) => `${connection.from}/${connection.to}`)
  )
  const baseTriggerNodes = nextNodes.filter(isWorkflowTriggerNode)
  const appendedNodes = newItems.map((item, index) =>
    createTriggerDraftNode(item, getNewTriggerNodePosition(baseTriggerNodes, primaryAgentNode!, index))
  )

  appendedNodes.forEach((node) => {
    const connectionKey = `${node.key}/${primaryAgentNode!.key}`
    if (!existingEdgeKeys.has(connectionKey)) {
      nextConnections.push(createConnection('edge', node.key, primaryAgentNode!.key))
      existingEdgeKeys.add(connectionKey)
    }
  })

  return {
    ...draft,
    team: {
      ...draft.team
    },
    nodes: [...nextNodes, ...appendedNodes],
    connections: nextConnections
  }
}

export function getPrimaryAgentNodeFromDraft(draft: TXpertTeamDraft): TXpertTeamNode<'agent'> | null {
  const primaryAgentKey = draft.team?.agent?.key
  if (!primaryAgentKey) {
    return null
  }

  return (
    draft.nodes.find(
      (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === primaryAgentKey
    ) ?? null
  )
}

function isWorkflowTriggerNode(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> {
  return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER
}

function getNewTriggerNodePosition(
  existingTriggerNodes: TXpertTeamNode<'workflow'>[],
  primaryAgentNode: TXpertTeamNode<'agent'>,
  index: number
) {
  if (existingTriggerNodes.length) {
    return {
      x: existingTriggerNodes[0].position.x,
      y: Math.max(...existingTriggerNodes.map((node) => node.position.y)) + (index + 1) * TRIGGER_NODE_VERTICAL_GAP
    }
  }

  return {
    x: primaryAgentNode.position.x - TRIGGER_NODE_HORIZONTAL_OFFSET,
    y: primaryAgentNode.position.y + index * TRIGGER_NODE_VERTICAL_GAP
  }
}

function createTriggerDraftNode(
  item: XpertDraftTriggerEditorItem,
  position: { x: number; y: number }
): TXpertTeamNode<'workflow'> {
  const providerName = item.provider.name.trim()

  return {
    type: 'workflow',
    key: item.nodeKey,
    position,
    entity: {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key: item.nodeKey,
      title: providerName,
      from: providerName,
      config: normalizeTriggerConfig(item.config)
    } as IWFNTrigger
  }
}

function createConnection(type: TXpertTeamConnection['type'], from: string, to: string): TXpertTeamConnection {
  return {
    type,
    key: `${from}/${to}`,
    from,
    to
  }
}

function normalizeTriggerConfig(config: Record<string, unknown> | null | undefined) {
  return config == null ? undefined : cloneTriggerConfig(config)
}

function cloneTriggerConfig<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    return value
  }

  return JSON.parse(JSON.stringify(value)) as T
}
