import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { NgmCopilotService } from '@metad/copilot-angular'
import { nonNullable } from '@metad/ocap-core'
import { ChatMessageHistory } from 'langchain/stores/message/in_memory'
import { filter, switchMap } from 'rxjs/operators'
import z from 'zod'

export function injectExamplesAgent() {
  const copilotService = inject(NgmCopilotService)
  const role = copilotService.rolePrompt
  const language = copilotService.languagePrompt

  const sessions = new Map<string, ChatMessageHistory>()

  return toSignal(
    copilotService.llm$.pipe(
      filter(nonNullable),
      switchMap(async (model) => {
        const prompt = ChatPromptTemplate.fromMessages(
          [
            [
              'system',
              `You are a professional BI data analyst.
{role}
{language}

You can provide users with data query suggestions, such as:
- This year's total <measure>
- Last year's monthly <measure> trend
- <measure> ratios between different <dimension> in this month.
- Compare <measure 1> and <measure 2> across different <dimension>.

The cube context is:
{context}

Give some example prompts for analysis the data cube.
`
            ],
            new MessagesPlaceholder('history'),
            ['human', '{input}']
          ]
          // { templateFormat: 'mustache' }
        )

        const llmWithStructuredOutput = model.withStructuredOutput(
          z.object({
            examples: z.array(z.string().describe('example prompt for data analysis'))
          }).describe('example prompts output')
        )

        const chain = prompt.pipe(llmWithStructuredOutput)

        return {
          invoke: async (state: { input: string; context?: string }, sessionId: string) => {
            if (!sessions.get(sessionId)) {
              sessions.set(sessionId, new ChatMessageHistory())
            }
            const chatMessageHistory = sessions.get(sessionId)
            const history = await chatMessageHistory.getMessages()

            return chain
              .pipe((result) => {
                chatMessageHistory.addMessages([
                  new HumanMessage(state.input),
                  new AIMessage(result.examples.join('\n'))
                ])
                return result
              })
              .invoke(
                { ...state, role: role(), language: language(), history },
                {
                  configurable: {
                    sessionId
                  }
                }
              )
          }
        }
      })
    )
  )
}
