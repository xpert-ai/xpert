import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DynamicStructuredTool } from '@langchain/core/tools'
import { makeCubeRulesPrompt } from '@xpert-ai/core';
import { Route } from 'apps/cloud/src/app/@core/copilot'

export async function createFormulaWorker({ llm, tools }: { llm: BaseChatModel; tools: DynamicStructuredTool[] }) {
  const systemPrompt = `You are a data analyst. Please use MDX expressions to create a calculated measure for a cube.` +
    ` The name of new calculation measure should be unique with existing measures.` +
    ` Use the dimensions, hierarchy, level and other names accurately according to the cube information provided.` +
    makeCubeRulesPrompt() +
    `\nTry to perform derivative calculations based on existing measures.` +
    `If the formula value is a ratio or percentage, you need to set unit to '%'.
{role}
{context}`

  return await Route.createWorkerAgent(llm, tools, systemPrompt)
}
