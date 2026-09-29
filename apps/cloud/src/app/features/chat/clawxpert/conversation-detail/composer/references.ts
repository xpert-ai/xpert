import type { ChatKitQuoteReference } from '@xpert-ai/chatkit-types'
import type { TChatElementReference, TChatFileElementReference } from '@xpert-ai/contracts'
import type { FileWorkbenchFilePathReferenceRequest, FileWorkbenchReferenceRequest } from '../../../../../@shared/files'

const INSPECTED_ELEMENT_ACTION_TARGET_TEXT =
  'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'

export function toFileElementQuoteReference(reference: TChatFileElementReference): ChatKitQuoteReference {
  const source = formatFileElementSource(reference)

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected HTML file element',
      'Scope: This reference is the currently inspected element only, not the entire file.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      `Source location: ${source}`,
      reference.documentTitle?.trim() ? `Document title: ${reference.documentTitle.trim()}` : null,
      'Inspected element:',
      `- Selector: ${reference.selector}`,
      `- DOM path: ${reference.domPath}`,
      `- Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `- Role: ${reference.role.trim()}` : null,
      `- Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Inspected element visible text:',
      reference.text,
      'Inspected element outerHTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

export function toFilePathQuoteReference(reference: FileWorkbenchFilePathReferenceRequest): ChatKitQuoteReference {
  return {
    type: 'quote',
    label: reference.path,
    source: 'Workspace file',
    text: reference.path
  }
}

export function toPageElementQuoteReference(reference: TChatElementReference): ChatKitQuoteReference {
  const source = reference.pageTitle?.trim() || reference.pageUrl.trim()

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected page element',
      'Scope: This reference is the currently inspected element only, not the entire page.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      source ? `Page: ${source}` : null,
      `URL: ${reference.pageUrl}`,
      `Service: ${reference.serviceId}`,
      `Selector: ${reference.selector}`,
      `Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `Role: ${reference.role.trim()}` : null,
      `Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Visible text:',
      reference.text,
      'HTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

function formatFileElementSource(reference: TChatFileElementReference) {
  if (typeof reference.sourceStartLine !== 'number') {
    return reference.filePath
  }

  const lineRange =
    reference.sourceStartLine === reference.sourceEndLine
      ? `${reference.sourceStartLine}`
      : `${reference.sourceStartLine}-${reference.sourceEndLine ?? reference.sourceStartLine}`

  return `${reference.filePath}:${lineRange}`
}

function formatElementAttributes(attributes: Array<{ name: string; value: string }>) {
  if (!attributes.length) {
    return '(none)'
  }

  return attributes.map((attribute) => `${attribute.name}="${attribute.value}"`).join(' ')
}

export function isFileElementReferenceRequest(
  request: FileWorkbenchReferenceRequest
): request is TChatFileElementReference {
  return 'type' in request && request.type === 'file_element'
}

export function isFilePathReferenceRequest(
  request: FileWorkbenchReferenceRequest
): request is FileWorkbenchFilePathReferenceRequest {
  return 'type' in request && request.type === 'file_path'
}
