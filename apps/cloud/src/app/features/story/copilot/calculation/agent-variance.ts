import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { makeCubeRulesPrompt } from '@xpert-ai/core'
import { Route } from 'apps/cloud/src/app/@core/copilot'
import { MEMBER_RETRIEVER_PROMPT } from './types'

export async function createVarianceMeasureWorker({
  llm,
  tools
}: {
  llm: BaseChatModel
  tools: DynamicStructuredTool[]
}) {
  const systemPrompt =
    `You are a data analyst. Please create a measure that calculate the variance or ratio between different members within a dimension.` +
    ` It is useful for comparing data, such as year-over-year changes, month-over-month changes, differences between versions, or differences between accounts.` +
    MEMBER_RETRIEVER_PROMPT +
    ` The name of new calculation measure should be unique with existing measures.` +
    ` Use the dimensions, hierarchy, level and other names accurately according to the cube information provided.` +
    makeCubeRulesPrompt() +
    `\n\n{role}` +
    `\n\n{context}`

  return await Route.createWorkerAgent(llm, tools, systemPrompt)
}
