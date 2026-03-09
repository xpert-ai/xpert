import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { StructuredTool } from '@langchain/core/tools'
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents'

export async function createCommandAgent(
  llm: BaseChatModel,
  tools: StructuredTool[],
  systemPrompt: string,
  systemContext?: () => Promise<string>
): Promise<AgentExecutor> {
  const combinedPrompt =
    systemPrompt +
    '\nWork autonomously according to your specialty, using the tools available to you.' +
    ' Do not ask for clarification.' +
    ' Your other team members (and other teams) will collaborate with you with their own specialties.'
  const toolNames = tools.map((t) => t.name).join(', ')
  let prompt = ChatPromptTemplate.fromMessages([
    ['system', combinedPrompt],
    new MessagesPlaceholder('messages'),
    new MessagesPlaceholder('agent_scratchpad'),
    [
      'system',
      [
        'Supervisor instructions: {instructions}\n' +
          `Remember, you individually can only use these tools: ${toolNames}` +
          '\n\nEnd if you have already completed the requested task. Communicate the work completed.'
      ].join('\n')
    ]
  ])

  if (systemContext) {
    prompt = await prompt.partial({
      system: systemContext
    })
  }

  const agent = await createOpenAIToolsAgent({ llm, tools, prompt })
  // createReactAgent()
  return new AgentExecutor({ agent, tools })
}
