import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import type { Attachment, ChatKitReference, SendUserMessageParams } from '@xpert-ai/chatkit-types'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

type HostSendUserMessageParams = SendUserMessageParams & {
  files?: unknown[]
  clientMessageId?: string
}

type AssistantChatSendMessageCommandOptions = {
  getControl: () => ChatKitControl | null | undefined
  isReady?: () => boolean
  unavailableMessage?: string
}

export function registerAssistantChatSendMessageCommand(
  registry: ViewClientCommandRegistry,
  options: AssistantChatSendMessageCommandOptions
) {
  return registry.register(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, async (payload) => {
    const control = options.getControl()
    if ((options.isReady && !options.isReady()) || !control) {
      return {
        success: false,
        code: 'unsupported',
        message: options.unavailableMessage ?? 'Assistant ChatKit is not ready.'
      }
    }

    const message = toSendUserMessageParams(payload)
    if (!message.text && !message.content?.length) {
      return {
        success: false,
        code: 'bad_request',
        message: 'Message text is required.'
      }
    }

    await control.sendUserMessage(message)
    return {
      success: true,
      status: 'sent',
      ...(message.clientMessageId ? { clientMessageId: message.clientMessageId } : {})
    }
  })
}

function toSendUserMessageParams(payload: unknown): HostSendUserMessageParams {
  const record = isRecord(payload) ? payload : {}
  const files = toArray(record['files'])
  const attachments = toAttachments(record['attachments']).concat(toFileAttachments(files))
  const references = toReferences(record['references'])
  const state = isRecord(record['state']) ? record['state'] : undefined
  const followUpMode = getString(record['followUpMode'])
  const clientMessageId = getString(record['clientMessageId'])
  const message: HostSendUserMessageParams = {
    text: getString(record['text']) ?? getString(record['input']) ?? '',
    ...(attachments.length ? { attachments } : {}),
    ...(references.length ? { references } : {}),
    ...(state ? { state } : {}),
    ...(followUpMode ? { followUpMode: followUpMode as SendUserMessageParams['followUpMode'] } : {}),
    ...(files.length ? { files } : {}),
    ...(clientMessageId ? { clientMessageId } : {})
  }

  return message
}

function toAttachments(value: unknown): Attachment[] {
  return toArray(value)
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }
      const id = getString(item['id'])
      const name = getString(item['name']) ?? getString(item['originalName'])
      const mimeType = getString(item['mime_type']) ?? getString(item['mimeType']) ?? getString(item['mimetype'])
      if (!id || !name || !mimeType) {
        return null
      }
      return {
        type: item['type'] === 'image' ? 'image' : 'file',
        id,
        name,
        mime_type: mimeType,
        ...(item['type'] === 'image' && getString(item['preview_url'])
          ? { preview_url: getString(item['preview_url'])! }
          : {})
      } as Attachment
    })
    .filter((item): item is Attachment => Boolean(item))
}

function toFileAttachments(files: unknown[]): Attachment[] {
  return files
    .map<Attachment | null>((file) => {
      if (!isRecord(file)) {
        return null
      }
      const id =
        getString(file['fileAssetId']) ??
        getString(file['fileId']) ??
        getString(file['id']) ??
        getString(file['storageFileId'])
      const name = getString(file['name']) ?? getString(file['originalName']) ?? 'source-document'
      const mimeType = getString(file['mimeType']) ?? getString(file['mimetype']) ?? 'application/octet-stream'
      if (!id) {
        return null
      }
      return {
        type: 'file',
        id,
        name,
        mime_type: mimeType
      }
    })
    .filter((item): item is Attachment => Boolean(item))
}

function toReferences(value: unknown): ChatKitReference[] {
  return toArray(value).filter((item): item is ChatKitReference => isRecord(item) && typeof item['type'] === 'string')
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
