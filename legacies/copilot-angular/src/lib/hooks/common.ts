import { Signal, inject } from '@angular/core'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { CopilotAgentType, CopilotEngine } from '@metad/copilot'
import { TranslateService } from '@ngx-translate/core'
import { injectCopilotCommand } from './inject-copilot-command'
import { NgmCopilotService } from '../services'

/**
 * @deprecated use Chatkit
 */
export function injectCommonCommands(copilotEngine: Signal<CopilotEngine>) {
  const translate = inject(TranslateService)
  const copilotService = inject(NgmCopilotService)
  
  return [
    injectCopilotCommand({
      name: 'clear',
      description: translate.instant('Copilot.ClearConversation', { Default: 'Clear conversation' }),
      implementation: async () => {
        copilotEngine().clear()
      }
    }),

    injectCopilotCommand('help', {
      alias: '?',
      description: translate.instant('Copilot.Help', { Default: 'Help' }),
      agent: {
        type: CopilotAgentType.LangChain,
        conversation: true
      },
      implementation: async () => {
        const commands = copilotEngine().commands()
        return `You can ask me general programming questions, or chat with the following participants which have specialized expertise and can perform actions:
- use \`/commandName\` to run a command.
- use \`@cubeName\` to select a metadata context.

**Commands**:
${commands.map((command) => `- \`/${command.name}\` ${command.alias ? 'or `/'+command.alias + '`' : '' }: ${command.description}`).join('\n')}
`
      },
      prompt: ChatPromptTemplate.fromMessages([
        [
          'system',
          `你是一个有用的数据分析 Agent, ` + (copilotService.roleDetail() ? `你的角色是: ${copilotService.roleDetail().title} 你的职责是：${copilotService.roleDetail().description};` : '') +
`请自我介绍并告诉用户你能他们做什么`
        ],
        new MessagesPlaceholder({
          variableName: 'chat_history',
        }),
        ['human', '{input}'],
      ])
    })
  ]
}
