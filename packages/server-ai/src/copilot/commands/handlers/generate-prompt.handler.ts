import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { AiProviderRole, ICopilot } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { CopilotService } from '../../copilot.service'
import { CopilotOneByRoleQuery } from '../../queries'
import { GeneratePromptCommand } from '../generate-prompt.command'

@CommandHandler(GeneratePromptCommand)
export class GeneratePromptHandler implements ICommandHandler<GeneratePromptCommand> {
	readonly #logger = new Logger(GeneratePromptHandler.name)

	constructor(
		private readonly service: CopilotService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GeneratePromptCommand) {
		let copilotModel = command.copilotModel
		let copilot: ICopilot | null = null
		if (copilotModel?.copilotId) {
			copilot = await this.service.findOne(copilotModel.copilotId)
		} else {
			copilot = await this.queryBus.execute(
				new CopilotOneByRoleQuery(
					RequestContext.currentTenantId(),
					RequestContext.getOrganizationId(),
					AiProviderRole.Primary
				)
			)
			copilotModel = copilot?.copilotModel
			if (!copilot) {
				throw new Error('No available primary copilot found for prompt generation')
			}
		}

		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, copilotModel, {
				abortController: new AbortController(),
				usageCallback: (tokens) => {
					//
				}
			})
		)

		const outputSchema = z.object({
			prompt: z.string().describe('The generated prompt template'),
			variables: z
				.array(
					z.object({
						name: z.string().describe('The name of the variable'),
						type: z
							.string()
							.optional()
							.nullable()
							.describe('The type of the variable, e.g., string, number'),
						description: z.string().optional().nullable().describe('A brief description of the variable')
					})
				)
				.optional()
				.nullable()
				.describe('List of variables used in the prompt template')
		})

		const prompt = ChatPromptTemplate.fromMessages(
			[
				[
					'human',
					`Here is a task description for which I would like you to create a high-quality prompt template for:
<task_description>
{{TASK_DESCRIPTION}}
</task_description>
Based on task description, please create a well-structured markdown format prompt template that another AI could use to consistently complete the task. The prompt template should include:
- Descriptive variable names surrounded by (two curly brackets) to indicate where the actual values will be substituted in. Choose variable names that clearly indicate the type of value expected. Variable names have to be composed of number, english alphabets and underline and nothing else. 
- Clear instructions for the AI that will be using this prompt, demarcated with <instructions> tags. The instructions should provide step-by-step directions on how to complete the task using the input variables. Also Specifies in the instructions that the output should not contain any xml tag. 
- Relevant examples if needed to clarify the task further, demarcated with <example> tags. Do not use curly brackets any other than in <instruction> section. 
- Any other relevant sections demarcated with appropriate tags like <input>, <output>, etc.
- Use the same language as task description. 
Please generate the full prompt template.
`
				]
			],
			{ templateFormat: 'mustache' }
		)

		const promptGenerator = prompt.pipe(chatModel.withStructuredOutput(outputSchema, { method: 'functionCalling' }))

		const result = await promptGenerator.invoke({
			TASK_DESCRIPTION: command.instruction
		})
		return result
	}
}
