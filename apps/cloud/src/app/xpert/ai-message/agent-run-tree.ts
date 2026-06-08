import {
  IXpertAgentExecution,
  TChatMessageStep,
  TMessageContentComplex,
  TMessageContentComponent,
  TMessageContentReasoning,
  TMessageContentText,
  XpertAgentExecutionStatusEnum
} from '../../@core'
import { TCopilotChatMessage } from '../types'

type ExecutionMetadata = {
  executionId?: string
  parentExecutionId?: string
  agentKey?: string
  xpertName?: string
  runId?: string
}

export type AgentRunInfo = IXpertAgentExecution & ExecutionMetadata

export type AgentRunEvent = TChatMessageStep &
  ExecutionMetadata & {
    id?: string
    event?: string
    title?: string
    message?: string
    status?: string
    error?: unknown
    data?: unknown
    created_date?: Date | string
  }

export type AgentRunEntry = {
  item: TMessageContentComplex | TMessageContentReasoning | AgentRunEvent | string
  index: number
  source: 'content' | 'reasoning' | 'event'
  order: number
}

export type AgentRunRenderNode = {
  id: string
  info: AgentRunInfo
  entries: AgentRunEntry[]
  children: AgentRunRenderNode[]
  firstOrder: number
}

export type AgentRunRenderUnit =
  | {
      type: 'entry'
      entry: AgentRunEntry
      order: number
    }
  | {
      type: 'agent'
      node: AgentRunRenderNode
      order: number
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readRecordString(value: unknown, field: string): string | undefined {
  return isRecord(value) ? readString(value[field]) : undefined
}

function readNestedName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return readString(value.name) ?? readString(value.title)
}

function isTextContent(content: unknown): content is TMessageContentText {
  return isRecord(content) && content.type === 'text'
}

function isReasoningContent(content: unknown): content is TMessageContentReasoning {
  return isRecord(content) && content.type === 'reasoning'
}

function isComponentContent(content: unknown): content is TMessageContentComponent {
  return isRecord(content) && content.type === 'component'
}

function readExecutionId(item: unknown): string | undefined {
  return readRecordString(item, 'executionId')
}

function readParentExecutionId(item: unknown): string | undefined {
  return readRecordString(item, 'parentExecutionId') ?? readRecordString(item, 'parentId')
}

function readAgentKey(item: unknown): string | undefined {
  return readRecordString(item, 'agentKey')
}

function readXpertName(item: unknown): string | undefined {
  return readRecordString(item, 'xpertName') ?? readNestedName(isRecord(item) ? item.xpert : undefined)
}

function readRunId(item: unknown): string | undefined {
  return readRecordString(item, 'runId')
}

export function normalizeRunStatus(status?: string | null) {
  return typeof status === 'string' && status.trim()
    ? status.trim().toLowerCase()
    : XpertAgentExecutionStatusEnum.PENDING
}

export function isRunningRunStatus(status?: string | null) {
  return normalizeRunStatus(status) === XpertAgentExecutionStatusEnum.RUNNING
}

export function isFailedRunStatus(status?: string | null) {
  const normalized = normalizeRunStatus(status)
  return (
    normalized === XpertAgentExecutionStatusEnum.ERROR ||
    normalized === 'fail' ||
    normalized === 'failed' ||
    normalized === XpertAgentExecutionStatusEnum.TIMEOUT
  )
}

export function getAgentRunDuration(info: AgentRunInfo) {
  if (typeof info.elapsedTime === 'number' && Number.isFinite(info.elapsedTime)) {
    return info.elapsedTime
  }

  const start = info.createdAt ? Date.parse(String(info.createdAt)) : null
  const end = info.updatedAt ? Date.parse(String(info.updatedAt)) : null
  if (!start || Number.isNaN(start) || !end || Number.isNaN(end)) {
    return null
  }

  return Math.max(0, end - start)
}

export function getAgentRunCounts(node: AgentRunRenderNode) {
  let text = 0
  let tools = 0
  let events = 0

  for (const entry of node.entries) {
    const item = entry.item
    if (typeof item === 'string') {
      if (item.trim()) {
        text += 1
      }
      continue
    }

    if (isTextContent(item) || isReasoningContent(item)) {
      if (item.text?.trim()) {
        text += 1
      }
      continue
    }

    if (isComponentContent(item)) {
      tools += 1
      continue
    }

    if (entry.source === 'event') {
      events += 1
    }
  }

  return {
    text,
    tools,
    events,
    children: node.children.length
  }
}

export function getAgentNodeUnits(node: AgentRunRenderNode): AgentRunRenderUnit[] {
  return [
    ...node.entries.map((entry) => ({
      type: 'entry' as const,
      entry,
      order: entry.order
    })),
    ...node.children.map((child) => ({
      type: 'agent' as const,
      node: child,
      order: child.firstOrder
    }))
  ].sort((a, b) => a.order - b.order)
}

function mergeAgentRunInfo(previous: AgentRunInfo, incoming: AgentRunInfo): AgentRunInfo {
  return {
    ...previous,
    ...incoming,
    id: previous.id || incoming.id,
    parentId: incoming.parentId ?? previous.parentId,
    parentExecutionId: incoming.parentExecutionId ?? previous.parentExecutionId,
    agentKey: incoming.agentKey ?? previous.agentKey,
    xpertName: incoming.xpertName ?? previous.xpertName,
    title: incoming.title ?? previous.title,
    status: incoming.status ?? previous.status,
    elapsedTime: incoming.elapsedTime ?? previous.elapsedTime,
    error: incoming.error ?? previous.error,
    inputs: incoming.inputs ?? previous.inputs
  }
}

function createAgentRunNode(nodes: Map<string, AgentRunRenderNode>, id: string, info: AgentRunInfo, order: number) {
  const existing = nodes.get(id)
  if (existing) {
    existing.info = mergeAgentRunInfo(existing.info, { ...info, id })
    existing.firstOrder = Math.min(existing.firstOrder, order)
    return existing
  }

  const node: AgentRunRenderNode = {
    id,
    info: { ...info, id },
    entries: [],
    children: [],
    firstOrder: order
  }
  nodes.set(id, node)
  return node
}

function normalizeExecution(execution: IXpertAgentExecution): AgentRunInfo | null {
  if (!execution?.id) {
    return null
  }

  return {
    ...execution,
    id: execution.id,
    parentExecutionId: readParentExecutionId(execution),
    agentKey: execution.agentKey,
    xpertName: readXpertName(execution)
  }
}

function findFallbackRunByAgentKey(runs: AgentRunInfo[], agentKey: string | undefined, rootExecutionId?: string) {
  if (!agentKey) {
    return null
  }

  const candidates = runs.filter((run) => run.agentKey === agentKey && run.id !== rootExecutionId)
  if (!candidates.length) {
    return null
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (isRunningRunStatus(candidates[index].status)) {
      return candidates[index]
    }
  }

  return candidates[candidates.length - 1]
}

function getEntryRunTarget(entry: AgentRunEntry, runs: AgentRunInfo[], rootExecutionId?: string) {
  const item = entry.item
  const executionId = readExecutionId(item)
  const parentExecutionId = readParentExecutionId(item)
  const agentKey = readAgentKey(item)

  if (executionId) {
    return {
      executionId,
      parentExecutionId,
      agentKey
    }
  }

  const fallbackRun = findFallbackRunByAgentKey(runs, agentKey, rootExecutionId)
  if (!fallbackRun) {
    return null
  }

  return {
    executionId: fallbackRun.id,
    parentExecutionId: fallbackRun.parentId ?? fallbackRun.parentExecutionId,
    agentKey
  }
}

function createInfoFromEntry(id: string, entry: AgentRunEntry, parentExecutionId?: string): AgentRunInfo {
  return {
    id,
    ...(parentExecutionId ? { parentId: parentExecutionId, parentExecutionId } : {}),
    ...(readAgentKey(entry.item) ? { agentKey: readAgentKey(entry.item) } : {}),
    ...(readXpertName(entry.item) ? { xpertName: readXpertName(entry.item) } : {}),
    ...(readRunId(entry.item) ? { runId: readRunId(entry.item) } : {})
  } as AgentRunInfo
}

function normalizeEntries(message: TCopilotChatMessage | null | undefined) {
  const entries: AgentRunEntry[] = []
  const content = message?.content

  if (typeof content === 'string') {
    if (content.trim()) {
      entries.push({
        item: {
          type: 'text',
          text: content
        } as TMessageContentText,
        index: 0,
        source: 'content',
        order: 0
      })
    }
  } else if (Array.isArray(content)) {
    content.forEach((item, index) => {
      entries.push({
        item,
        index,
        source: 'content',
        order: index
      })
    })
  }

  const reasoningStart = entries.length
  ;(message?.reasoning ?? []).forEach((item, index) => {
    entries.push({
      item,
      index,
      source: 'reasoning',
      order: reasoningStart + index
    })
  })

  const eventStart = entries.length
  ;(message?.events ?? []).forEach((item, index) => {
    entries.push({
      item: item as AgentRunEvent,
      index,
      source: 'event',
      order: eventStart + index
    })
  })

  return entries
}

function refreshAgentNodeOrder(node: AgentRunRenderNode): number {
  let order = node.firstOrder
  for (const child of node.children) {
    order = Math.min(order, refreshAgentNodeOrder(child))
  }
  node.firstOrder = order
  node.children.sort((a, b) => a.firstOrder - b.firstOrder)
  return order
}

export function buildAgentRunRenderTree(message: TCopilotChatMessage | null | undefined) {
  const rootExecutionId = message?.executionId
  const runs = (message?.executions ?? []).map(normalizeExecution).filter((item): item is AgentRunInfo => !!item)
  const entries = normalizeEntries(message)
  const nodes = new Map<string, AgentRunRenderNode>()
  const rootEntries: AgentRunEntry[] = []
  const rootReasoning: TMessageContentReasoning[] = []
  const rootEvents: TChatMessageStep[] = []
  const baseOrder = entries.length + 1

  runs.forEach((run, index) => {
    createAgentRunNode(nodes, run.id, run, baseOrder + index / 1000)
  })

  for (const entry of entries) {
    const target = getEntryRunTarget(entry, runs, rootExecutionId)
    const shouldGroup = !!target?.executionId && (target.executionId !== rootExecutionId || !!target.parentExecutionId)

    if (!target || !shouldGroup) {
      if (entry.source === 'reasoning' && isReasoningContent(entry.item)) {
        rootReasoning.push(entry.item)
      } else if (entry.source === 'event') {
        rootEvents.push(entry.item as TChatMessageStep)
      } else {
        rootEntries.push(entry)
      }
      continue
    }

    const node = createAgentRunNode(
      nodes,
      target.executionId,
      createInfoFromEntry(target.executionId, entry, target.parentExecutionId),
      entry.order
    )
    node.entries.push(entry)
    node.firstOrder = Math.min(node.firstOrder, entry.order)
  }

  const roots: AgentRunRenderNode[] = []
  for (const node of nodes.values()) {
    if (node.id === rootExecutionId && !node.info.parentId) {
      continue
    }

    const parentId = node.info.parentId ?? node.info.parentExecutionId
    if (parentId && parentId !== rootExecutionId && parentId !== node.id) {
      const parent = nodes.get(parentId)
      if (parent) {
        parent.children.push(node)
        continue
      }
    }

    roots.push(node)
  }

  roots.forEach(refreshAgentNodeOrder)
  roots.sort((a, b) => a.firstOrder - b.firstOrder)

  const units: AgentRunRenderUnit[] = [
    ...rootEntries.map((entry) => ({
      type: 'entry' as const,
      entry,
      order: entry.order
    })),
    ...roots.map((node) => ({
      type: 'agent' as const,
      node,
      order: node.firstOrder
    }))
  ].sort((a, b) => a.order - b.order)

  return {
    units,
    rootReasoning,
    rootEvents,
    hasAgentRuns: roots.length > 0
  }
}
