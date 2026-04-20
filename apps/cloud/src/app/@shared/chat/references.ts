import type { TChatCodeReference, TChatQuoteReference, TChatReference } from '@xpert-ai/contracts'
import type { TChatRequestHuman } from '@cloud/app/@core'

export type XpertCodeReference = TChatCodeReference

export type XpertQuoteReference = TChatQuoteReference

export type XpertChatReference = TChatReference

export type XpertReferenceCompositionMode = 'compose' | 'preserve'

export type XpertChatNavigationInput = {
  input: string
  references?: XpertChatReference[]
}

export type XpertChatRequestHuman = TChatRequestHuman & {
  references?: XpertChatReference[]
  referenceComposition?: XpertReferenceCompositionMode
}

type ChatReferenceCandidate = {
  type?: unknown
  id?: unknown
  label?: unknown
  text?: unknown
  path?: unknown
  startLine?: unknown
  endLine?: unknown
  language?: unknown
  taskId?: unknown
  messageId?: unknown
  source?: unknown
  input?: unknown
  references?: unknown
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCodeReference(value: unknown): value is XpertCodeReference {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as ChatReferenceCandidate
  if (candidate.type !== 'code') {
    return false
  }

  return (
    isNonEmptyString(candidate.text) &&
    isNonEmptyString(candidate.path) &&
    isFiniteNumber(candidate.startLine) &&
    isFiniteNumber(candidate.endLine) &&
    isOptionalString(candidate.id) &&
    isOptionalString(candidate.label) &&
    isOptionalString(candidate.language) &&
    isOptionalString(candidate.taskId)
  )
}

function isQuoteReference(value: unknown): value is XpertQuoteReference {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as ChatReferenceCandidate
  if (candidate.type !== 'quote') {
    return false
  }

  return (
    isNonEmptyString(candidate.text) &&
    isOptionalString(candidate.id) &&
    isOptionalString(candidate.label) &&
    isOptionalString(candidate.messageId) &&
    isOptionalString(candidate.source)
  )
}

export function normalizeReferences(value: unknown): XpertChatReference[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((reference): reference is XpertChatReference => {
    return isCodeReference(reference) || isQuoteReference(reference)
  })
}

export function readNavigationInput(value: unknown): XpertChatNavigationInput | null {
  if (!value || typeof value !== 'object' || !('input' in value)) {
    return null
  }

  const input = typeof value.input === 'string' ? value.input.trim() : ''
  const references = 'references' in value ? normalizeReferences(value.references) : []

  if (!input && !references.length) {
    return null
  }

  return {
    input,
    ...(references.length ? { references } : {})
  }
}

export function getReferenceKey(reference: XpertChatReference): string {
  if (isNonEmptyString(reference.id)) {
    return reference.id.trim()
  }

  if (reference.type === 'code') {
    return [reference.type, reference.path, reference.startLine, reference.endLine, reference.text].join(':')
  }

  return [reference.type, reference.messageId ?? '', reference.source ?? '', reference.text].join(':')
}

export function mergeReferences(current: XpertChatReference[], incoming: XpertChatReference[]): XpertChatReference[] {
  const merged = [...current]
  const seen = new Set(current.map(getReferenceKey))

  incoming.forEach((reference) => {
    const key = getReferenceKey(reference)
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    merged.push(reference)
  })

  return merged
}

function getCodeReferenceRange(reference: XpertCodeReference): string {
  return reference.startLine === reference.endLine
    ? `${reference.startLine}`
    : `${reference.startLine}-${reference.endLine}`
}

export function getReferenceLabel(reference: XpertChatReference): string {
  if (isNonEmptyString(reference.label)) {
    return reference.label.trim()
  }

  if (reference.type === 'code') {
    return `${reference.path}:${getCodeReferenceRange(reference)}`
  }

  const normalized = reference.text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 32) {
    return normalized
  }

  return `${normalized.slice(0, 29)}...`
}

export function getReferenceSource(reference: XpertChatReference): string | null {
  if (reference.type === 'code') {
    return reference.language?.trim() || null
  }

  if (isNonEmptyString(reference.source)) {
    return reference.source.trim()
  }

  return null
}

export function createReferenceHumanInput(input: {
  content: string
  files?: TChatRequestHuman['files']
  references?: XpertChatReference[]
}): XpertChatRequestHuman {
  const references = input.references ?? []

  return {
    input: input.content,
    ...(input.files?.length ? { files: input.files } : {}),
    ...(references.length ? { references, referenceComposition: 'compose' as const } : {})
  }
}
