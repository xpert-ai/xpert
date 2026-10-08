import type { BaseMessage } from '@langchain/core/messages'
import type { ToolOutputImageAttachment, ToolOutputPresentation } from '@xpert-ai/chatkit-types'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ModelRequirements } from '../../agent/middleware/model-requirements'
export type { ToolOutputImageAttachment, ToolOutputPresentation } from '@xpert-ai/chatkit-types'

export type ToolImageModelInput = { messages: BaseMessage[]; requirements?: ModelRequirements }

/** Images stay in immutable Artifacts; tool results and graph checkpoints contain references only. */
export interface ToolImagesApi {
  /** Host identity, conversation and Workspace scope are bound to the current execution. */
  save(input: {
    buffer: Buffer
    mimeType: ToolOutputImageAttachment['mimeType']
    title: string
  }): Promise<ToolOutputPresentation>

  /**
   * Project the current complete tool round into one outbound model request. Names identify tools
   * whose successful result must contain an image presentation; error results remain text.
   * Never persist the returned messages. Merge requirements into the request with mergeModelRequirements.
   */
  prepareModelInput(messages: BaseMessage[], toolNames: readonly string[]): Promise<ToolImageModelInput>
}

export const ToolImagesRuntimeCapability = createRuntimeCapability<ToolImagesApi>('platform.tool-images', {
  description: 'Save scoped immutable tool images and materialize verified pixels for one model request.'
})
