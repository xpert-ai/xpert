import { Type } from '@angular/core'
import { TXpertTeamNode, WorkflowNodeTypeEnum } from '@cloud/app/@core'
import { provideJsonSchemaWidgetStrategy } from '@cloud/app/@shared/forms'

export type XpertStudioNodeStatus = 'success' | 'error' | 'template'

export const VISION_DEFAULT_VARIABLE = `human.files`

export const GROUP_NODE_TYPES = [WorkflowNodeTypeEnum.ITERATOR]

export type ClipboardNodeReadResult = {
  node: TXpertTeamNode | null
  hasText: boolean
  error?: unknown
}

export async function readClipboardNode(): Promise<ClipboardNodeReadResult> {
  if (!navigator?.clipboard?.readText) {
    return { node: null, hasText: false }
  }

  try {
    const text = await navigator.clipboard.readText()
    if (!text) {
      return { node: null, hasText: false }
    }

    try {
      const parsed = JSON.parse(text)
      return { node: isPasteableNode(parsed) ? parsed : null, hasText: true }
    } catch (error) {
      return { node: null, hasText: true, error }
    }
  } catch (error) {
    return { node: null, hasText: false, error }
  }
}

export function isPasteableNode(node: unknown): node is TXpertTeamNode {
  if (!node || typeof node !== 'object') {
    return false
  }

  const candidate = node as TXpertTeamNode
  return !!candidate.type &&
    !!candidate.position &&
    typeof candidate.position.x === 'number' &&
    typeof candidate.position.y === 'number'
}

export function provideJsonSchemaWidgets() {
  return provideJsonSchemaWidgetStrategy(
    {
      name: 'ai-model-select',
      /**
       * Lazy load the real component.
       */
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/copilot/copilot-model-select/index').then(
          (m) => m.CopilotModelSelectComponent
        )
      }
    },
    {
      name: 'agent-interrupt-on',
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/agent/middlewares').then((m) => m.AgentInterruptOnComponent)
      }
    },
    {
      name: 'code-editor',
      async load(): Promise<Type<unknown>> {
        return import('@cloud/app/@shared/editors').then((m) => m.CodeEditorComponent)
      }
    }
  )
}
