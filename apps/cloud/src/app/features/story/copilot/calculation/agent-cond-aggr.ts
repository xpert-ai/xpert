import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { makeCubeRulesPrompt } from '@xpert-ai/core'
import { Route } from 'apps/cloud/src/app/@core/copilot'
import { MEMBER_RETRIEVER_PROMPT } from './types'

export async function createConditionalAggregationWorker({
  llm,
  tools
}: {
  llm: BaseChatModel
  tools: DynamicStructuredTool[]
}) {
  const systemPrompt =
    `You are a data analyst. Please create an aggregated measure based on various operations and dimensions.` +
    ` It supports operations such as Count, Sum, TopCount, TopSum, Min, Max, and Avg.` +
    ` This function is suitable when you need to perform different types of aggregations based on certain conditions.` +
    MEMBER_RETRIEVER_PROMPT +
    ` The name of new calculation measure should be unique with existing measures.` +
    ` Use the dimensions, hierarchy, level and other names accurately according to the cube information provided.` +
    makeCubeRulesPrompt() +
    `\n\n{role}` +
    `\n\n{context}`

  return await Route.createWorkerAgent(llm, tools, systemPrompt)
}

// export function injectCreateConditionalAggregationWorker() {
//     const memberRetrieverTool = injectDimensionMemberTool()

//     return async ({llm,tools}: {
//         llm: ChatOpenAI
//         tools: DynamicStructuredTool[]
//       }) => {
//         const systemPrompt =
//             `You are a data analyst. Please create an aggregated measure based on various operations and dimensions.` +
//             ` It supports operations such as Count, Sum, TopCount, TopSum, Min, Max, and Avg.` +
//             ` This function is suitable when you need to perform different types of aggregations based on certain conditions.` +
//             MEMBER_RETRIEVER_PROMPT +
//             ` The name of new calculation measure should be unique with existing measures.` +
//             ` Use the dimensions, hierarchy, level and other names accurately according to the cube information provided.` +
//             makeCubeRulesPrompt() +
//             `\n\n{role}` +
//             `\n\n{context}`

//         return await Route.createWorkerAgent(llm, [...tools, memberRetrieverTool, ], systemPrompt)
//     }
// }
