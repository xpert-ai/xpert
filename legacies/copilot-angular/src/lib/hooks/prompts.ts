import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

/**
 * @deprecated use Chatkit
 */
export function createAgentPromptTemplate(system: string) {
  return ChatPromptTemplate.fromMessages([
    ['system', system],
    new MessagesPlaceholder({
      variableName: 'chat_history',
      optional: true
    }),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad')
  ])
}
