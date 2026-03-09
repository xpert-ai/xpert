import { Signal } from '@angular/core'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, FewShotPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { ChatOpenAI } from '@langchain/openai'
import { Indicator } from '@metad/cloud/state'
import { IndicatorArchitectState, markdownIndicators } from './types'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const plan = zodToJsonSchema(
  z.object({
    steps: z.array(z.string()).describe('different indicators to create, should be in sorted order')
  })
)
export const planFunction = {
  name: 'plan',
  description: 'This tool is used to plan the indicators set to create',
  parameters: plan
}

function _createPlannerAgent(llm: ChatOpenAI) {
  const combinedPrompt =
    `As a indicator system architect specializing in data analysis, your task is to develop a set of indicators specifically for business data analysis based on multidimensional cube information and user prompts, and align with your business role.
Each indicator gives a concise business requirement and name, and the indicators are sorted in the order of creation dependencies.

{role}

{context}

Do not create duplicate indicators that already exist:
{indicators}
`

  const plannerPrompt = ChatPromptTemplate.fromMessages([
    ['system', combinedPrompt],
    new MessagesPlaceholder('messages')
  ])

  const model = llm.withStructuredOutput(planFunction)

  const planner = plannerPrompt.pipe(model)

  return planner
}

export async function createPlannerAgent({
  llm,
  fewShotTemplate,
  indicators
}: {
  llm: ChatOpenAI
  fewShotTemplate: FewShotPromptTemplate
  indicators: Signal<Indicator[]>
}) {
  const agent = _createPlannerAgent(llm)

  return RunnableLambda.from(async (state: IndicatorArchitectState) => {
    // Call fewshot examples prompt
    const content = await fewShotTemplate.format({ input: state.input, context: state.context })
    return {
      ...state,
      indicators: markdownIndicators(indicators()),
      messages: [
        new HumanMessage(content)
      ]
    }
  })
    .pipe(agent)
    .pipe((plan) => {
      return {
        plan: plan.steps,
        messages: [new AIMessage(`The indicator system is: \n${plan.steps.map((step, index) => `  - ` + step).join('\n')}`)]
      }
    })
}
