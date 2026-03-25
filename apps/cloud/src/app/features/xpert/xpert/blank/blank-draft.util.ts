import {
  createAgentConnections,
  createXpertNodes,
  genPipelineChunkerKey,
  genPipelineKnowledgeBaseKey,
  genPipelineProcessorKey,
  genPipelineSourceKey,
  genPipelineUnderstandingKey,
  genXpertMiddlewareKey,
  genXpertSkillKey,
  genXpertTriggerKey,
  IWFNChunker,
  IWFNKnowledgeBase,
  IWFNMiddleware,
  IWFNProcessor,
  IWFNSkill,
  IWFNSource,
  IWFNTrigger,
  IWFNUnderstanding,
  IXpert,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '@metad/contracts'
import { layoutGraphWithMixedDirection } from '../../studio/domain/layout/layout'

const HORIZONTAL_OFFSET = 280
const MIDDLEWARE_VERTICAL_OFFSET = 220
const NODE_VERTICAL_GAP = 120
const KNOWLEDGE_STAGE_X_GAP = 320
const KNOWLEDGE_STAGE_BASE_Y = 220

export type XpertBlankWizardSelections = {
  triggerProviders?: string[]
  skills?: string[]
  middlewares?: string[]
}

export type KnowledgeBlankWizardSelections = {
  triggerProviders?: string[]
  sourceProviders?: string[]
  processorProviders?: string[]
  chunkerProviders?: string[]
  understandingProviders?: string[]
}

export function normalizeBlankWizardSelections(
  selections?: XpertBlankWizardSelections
): Required<XpertBlankWizardSelections> {
  return {
    triggerProviders: uniqueStrings(selections?.triggerProviders),
    skills: uniqueStrings(selections?.skills),
    middlewares: uniqueStrings(selections?.middlewares)
  }
}

export function hasBlankWizardSelections(selections?: XpertBlankWizardSelections): boolean {
  const normalized = normalizeBlankWizardSelections(selections)
  return !!(normalized.triggerProviders.length || normalized.skills.length || normalized.middlewares.length)
}

export function normalizeKnowledgeBlankWizardSelections(
  selections?: KnowledgeBlankWizardSelections
): Required<KnowledgeBlankWizardSelections> {
  return {
    triggerProviders: uniqueStrings(selections?.triggerProviders),
    sourceProviders: uniqueStrings(selections?.sourceProviders),
    processorProviders: uniqueStrings(selections?.processorProviders),
    chunkerProviders: uniqueStrings(selections?.chunkerProviders),
    understandingProviders: uniqueStrings(selections?.understandingProviders)
  }
}

export async function buildBlankXpertDraft(
  xpert: IXpert,
  selections?: XpertBlankWizardSelections
): Promise<TXpertTeamDraft> {
  const normalized = normalizeBlankWizardSelections(selections)
  const { agents, ...team } = xpert
  const nodes = [...createXpertNodes(xpert, { x: 0, y: 0 }).nodes]
  const connections = createBaseConnections(xpert)
  const primaryAgentKey = xpert.agent?.key
  const primaryAgentNode = nodes.find(
    (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === primaryAgentKey
  )

  if (!primaryAgentNode || !primaryAgentKey) {
    throw new Error('Primary agent node not found for blank xpert draft initialization')
  }

  const triggerNodes = createTriggerNodes(primaryAgentNode, normalized.triggerProviders)
  const skillNodes = createSkillNodes(primaryAgentNode, normalized.skills)
  const middlewareNodes = createMiddlewareNodes(primaryAgentNode, normalized.middlewares)

  nodes.push(...triggerNodes, ...skillNodes, ...middlewareNodes)
  connections.push(
    ...triggerNodes.map((node) => createConnection('edge', node.key, primaryAgentKey)),
    ...skillNodes.map((node) => createConnection('workflow', primaryAgentKey, node.key)),
    ...middlewareNodes.map((node) => createConnection('workflow', primaryAgentKey, node.key))
  )

  const draft: TXpertTeamDraft = {
    team: {
      ...team,
      agent: {
        ...xpert.agent,
        options: {
          ...(xpert.agent?.options ?? {}),
          middlewares: middlewareNodes.length
            ? {
                ...(xpert.agent?.options?.middlewares ?? {}),
                order: uniqueStrings([
                  ...(xpert.agent?.options?.middlewares?.order ?? []),
                  ...middlewareNodes.map((node) => node.key)
                ])
              }
            : xpert.agent?.options?.middlewares
        }
      }
    },
    nodes,
    connections
  }

  await layoutGraphWithMixedDirection(draft)

  return draft
}

export async function buildBlankKnowledgeDraft(
  xpert: IXpert,
  selections?: KnowledgeBlankWizardSelections
): Promise<TXpertTeamDraft> {
  const normalized = normalizeKnowledgeBlankWizardSelections(selections)
  const { agents, ...team } = xpert
  const stageGroups = createKnowledgePipelineStageGroups(normalized)
  const nodes = stageGroups.flat()
  const connections = createKnowledgePipelineConnections(stageGroups)

  const draft: TXpertTeamDraft = {
    team: {
      ...team,
      agent: {
        ...xpert.agent,
        options: {
          ...(xpert.agent?.options ?? {}),
          hidden: true
        }
      }
    },
    nodes,
    connections
  }

  return draft
}

function createBaseConnections(xpert: IXpert): TXpertTeamConnection[] {
  const connections: TXpertTeamConnection[] = []

  if (xpert.agent && !xpert.agent.options?.hidden) {
    connections.push(...createAgentConnections(xpert.agent, xpert.executors ?? []))
  }

  for (const agent of xpert.agents ?? []) {
    connections.push(...createAgentConnections(agent, xpert.executors ?? []))
  }

  return connections
}

function createTriggerNodes(agentNode: TXpertTeamNode<'agent'>, triggerProviders: string[]): TXpertTeamNode<'workflow'>[] {
  return triggerProviders.map((provider, index, providers) => {
    const key = genXpertTriggerKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x - HORIZONTAL_OFFSET,
        y: getCenteredY(agentNode.position.y, providers.length, index)
      },
      entity: {
        type: WorkflowNodeTypeEnum.TRIGGER,
        key,
        from: provider,
        title: provider === 'chat' ? 'Trigger' : provider
      } as IWFNTrigger
    }
  })
}

function createKnowledgePipelineStageGroups(
  selections: Required<KnowledgeBlankWizardSelections>
): TXpertTeamNode<'workflow'>[][] {
  const stageGroups: TXpertTeamNode<'workflow'>[][] = [
    selections.triggerProviders.map((provider) => createKnowledgeTriggerNode(provider)),
    selections.sourceProviders.map((provider) => createKnowledgeSourceNode(provider)),
    selections.processorProviders.map((provider) => createKnowledgeProcessorNode(provider)),
    selections.chunkerProviders.map((provider) => createKnowledgeChunkerNode(provider)),
    selections.understandingProviders.map((provider) => createKnowledgeUnderstandingNode(provider)),
    [createKnowledgeBaseNode()]
  ].filter((group, index) => index === 5 || group.length)

  positionKnowledgePipelineStageGroups(stageGroups)

  return stageGroups
}

function createKnowledgeTriggerNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genXpertTriggerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.TRIGGER,
      key,
      from: provider,
      title: provider === 'chat' ? 'Chat' : provider
    } as IWFNTrigger
  }
}

function createKnowledgeSourceNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineSourceKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.SOURCE,
      key,
      title: provider,
      provider,
      config: {}
    } as IWFNSource
  }
}

function createKnowledgeProcessorNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineProcessorKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.PROCESSOR,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNProcessor
  }
}

function createKnowledgeChunkerNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineChunkerKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.CHUNKER,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNChunker
  }
}

function createKnowledgeUnderstandingNode(provider: string): TXpertTeamNode<'workflow'> {
  const key = genPipelineUnderstandingKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.UNDERSTANDING,
      key,
      title: provider,
      provider,
      config: {},
      input: ''
    } as IWFNUnderstanding
  }
}

function createKnowledgeBaseNode(): TXpertTeamNode<'workflow'> {
  const key = genPipelineKnowledgeBaseKey()
  return {
    type: 'workflow',
    key,
    position: { x: 0, y: 0 },
    entity: {
      type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
      key,
      title: 'Knowledge Base'
    } as IWFNKnowledgeBase
  }
}

function createKnowledgePipelineConnections(stageGroups: TXpertTeamNode<'workflow'>[][]): TXpertTeamConnection[] {
  const connections: TXpertTeamConnection[] = []

  for (let index = 0; index < stageGroups.length - 1; index++) {
    const currentGroup = stageGroups[index]
    const nextGroup = stageGroups[index + 1]

    for (const currentNode of currentGroup) {
      for (const nextNode of nextGroup) {
        connections.push(createConnection('edge', currentNode.key, nextNode.key))
      }
    }
  }

  return connections
}

function positionKnowledgePipelineStageGroups(stageGroups: TXpertTeamNode<'workflow'>[][]) {
  stageGroups.forEach((group, stageIndex) => {
    group.forEach((node, nodeIndex) => {
      node.position = {
        x: stageIndex * KNOWLEDGE_STAGE_X_GAP,
        y: getCenteredY(KNOWLEDGE_STAGE_BASE_Y, group.length, nodeIndex)
      }
    })
  })
}

function createSkillNodes(agentNode: TXpertTeamNode<'agent'>, skills: string[]): TXpertTeamNode<'workflow'>[] {
  return skills.map((skill, index, items) => {
    const key = genXpertSkillKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x + HORIZONTAL_OFFSET,
        y: getCenteredY(agentNode.position.y, items.length, index)
      },
      entity: {
        type: WorkflowNodeTypeEnum.SKILL,
        key,
        title: skill,
        skills: [skill]
      } as IWFNSkill
    }
  })
}

function createMiddlewareNodes(
  agentNode: TXpertTeamNode<'agent'>,
  middlewares: string[]
): TXpertTeamNode<'workflow'>[] {
  return middlewares.map((provider, index) => {
    const key = genXpertMiddlewareKey()
    return {
      type: 'workflow',
      key,
      position: {
        x: agentNode.position.x,
        y: agentNode.position.y + MIDDLEWARE_VERTICAL_OFFSET + index * NODE_VERTICAL_GAP
      },
      entity: {
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        key,
        title: provider,
        provider
      } as IWFNMiddleware
    }
  })
}

function createConnection(
  type: TXpertTeamConnection['type'],
  from: string,
  to: string
): TXpertTeamConnection {
  return {
    type,
    key: `${from}/${to}`,
    from,
    to
  }
}

function getCenteredY(anchorY: number, total: number, index: number) {
  return anchorY - ((total - 1) * NODE_VERTICAL_GAP) / 2 + index * NODE_VERTICAL_GAP
}

function uniqueStrings(values?: string[]) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => !!value)
    )
  )
}
