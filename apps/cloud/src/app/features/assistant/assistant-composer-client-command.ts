import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, type AssistantComposerReference } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

type Options = {
  getControl: () => Pick<ChatKitControl, 'element' | 'setComposerValue' | 'focusComposer'> | null | undefined
  isReady?: () => boolean
}

export function registerAssistantComposerAppendReferencesCommand(
  registry: ViewClientCommandRegistry,
  options: Options
) {
  return registry.register(ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, async (payload) => {
    const references = parseReferences(payload)
    if (!references) return { success: false, code: 'bad_request' }
    const control = options.getControl()
    if (!control?.element || (options.isReady && !options.isReady())) return { success: false, code: 'unsupported' }
    try {
      await control.setComposerValue({ references, appendReferences: true })
    } catch {
      return { success: false, code: 'composer_update_failed' }
    }
    // Focus failure must not invite retrying an already appended reference.
    let focused = true
    try {
      await control.focusComposer()
    } catch {
      focused = false
    }
    return { success: true, status: 'appended', focused }
  })
}

function optionalText(value: unknown, limit = 1024): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= limit)
}

function parseReferences(payload: unknown): AssistantComposerReference[] | null {
  if (!payload || typeof payload !== 'object' || !('references' in payload) || !Array.isArray(payload.references))
    return null
  if (!payload.references.length || payload.references.length > 20) return null
  const result: AssistantComposerReference[] = []
  let total = 0
  const items: unknown[] = payload.references
  for (const item of items) {
    // Only validated, supported fields cross the plugin-to-composer boundary.
    if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string' || !item.text.trim())
      return null
    const id = 'id' in item ? item.id : undefined
    const label = 'label' in item ? item.label : undefined
    total += item.text.length
    if (total > 200000 || !optionalText(id) || !optionalText(label)) return null
    const base = {
      text: item.text,
      ...(id !== undefined ? { id: id } : {}),
      ...(label !== undefined ? { label: label } : {})
    }
    if (!('type' in item)) return null
    if (item.type === 'code') {
      const language = 'language' in item ? item.language : undefined
      if (
        !('path' in item) ||
        !('startLine' in item) ||
        !('endLine' in item) ||
        typeof item.startLine !== 'number' ||
        typeof item.endLine !== 'number' ||
        typeof item.path !== 'string' ||
        !item.path.trim() ||
        item.path.length > 4096 ||
        !Number.isSafeInteger(item.startLine) ||
        item.startLine < 1 ||
        !Number.isSafeInteger(item.endLine) ||
        item.endLine < item.startLine ||
        !optionalText(language, 128)
      )
        return null
      result.push({
        ...base,
        type: 'code',
        path: item.path,
        startLine: item.startLine,
        endLine: item.endLine,
        ...(language !== undefined ? { language: language } : {})
      })
    } else if (item.type === 'quote') {
      const source = 'source' in item ? item.source : undefined
      const messageId = 'messageId' in item ? item.messageId : undefined
      if (!optionalText(source, 4096) || !optionalText(messageId)) return null
      result.push({
        ...base,
        type: 'quote',
        ...(source !== undefined ? { source: source } : {}),
        ...(messageId !== undefined ? { messageId: messageId } : {})
      })
    } else return null
  }
  return result
}
