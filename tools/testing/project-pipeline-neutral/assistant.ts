import { Injectable } from '@nestjs/common'
import {
  ProjectPipelineRuntimeAdapterProvider,
  type ProjectPipelineAssistantOperation,
  type ProjectPipelineAssistantContext
} from '@xpert-ai/plugin-sdk'

/** Only opt-in acceptance configurations use a separately published, tool-free Assistant. */
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('assistant_operation', 'acceptance.wait@1')
export class NeutralAssistantOperation implements ProjectPipelineAssistantOperation {
  readonly kind = 'assistant_operation'
  readonly ref = 'acceptance.wait@1'
  async prepare(_context: ProjectPipelineAssistantContext) {
    return { prompt: 'Reply with the single word ACCEPTED. This is a synthetic model-budget acceptance check.' }
  }
  async collect(_context: ProjectPipelineAssistantContext) {
    return {}
  }
}
