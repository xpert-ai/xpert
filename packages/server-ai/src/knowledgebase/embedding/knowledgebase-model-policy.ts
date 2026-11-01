import { TCopilotModel } from '@xpert-ai/contracts'

export type TEmbeddingCopilotModel = Partial<TCopilotModel> & { id?: string }

export type TKnowledgebaseModelContext = {
    xpertId?: string
    threadId?: string
}
