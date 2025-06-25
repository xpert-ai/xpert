import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { END, Send } from '@langchain/langgraph'
import {
	channelName,
	IWFNClassifier,
	IXpertAgentExecution,
	mapTranslationLanguage,
	TAgentRunnableConfigurable,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import z from 'zod'
import { XpertConfigException } from '../../../core'
import { assignExecutionUsage } from '../../../xpert-agent-execution'
import { GetXpertChatModelQuery } from '../../../xpert/queries'
import { CreateWNClassifierCommand } from '../create-wn-classifier.command'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

@CommandHandler(CreateWNClassifierCommand)
export class CreateWNClassifierHandler implements ICommandHandler<CreateWNClassifierCommand> {
	readonly #logger = new Logger(CreateWNClassifierHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateWNClassifierCommand) {
		const { xpert, graph, node } = command
		const { isDraft, subscriber, environment } = command.options

		const entity = node.entity as IWFNClassifier
		const copilotModel = entity.copilotModel ?? xpert.copilotModel
		const inputVariables = entity.inputVariables
		const classes = entity.classes
		const instruction = entity.instruction

		if (!copilotModel?.copilot) {
			throw new XpertConfigException(
				await this.i18nService.t('xpert.Error.CopilotModelConfigError', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: { model: copilotModel.model }
				})
			)
		}

		if (!classes?.length) {
			throw new XpertConfigException(
				await this.i18nService.t('xpert.Error.ClassifierClassesRequired', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						node: node.entity.title || node.key
					}
				})
			)
		}

		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
					const configurable: TAgentRunnableConfigurable = config.configurable
					const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
					const stateEnv = stateToParameters(state, environment)
					const inputs = inputVariables.map((name) => get(stateEnv, name, ''))

					const execution: IXpertAgentExecution = {
						category: 'workflow',
						type: WorkflowNodeTypeEnum.CLASSIFIER,
						inputs: inputs,
						parentId: executionId,
						threadId: thread_id,
						checkpointNs: checkpoint_ns,
						checkpointId: checkpoint_id,
						agentKey: node.key,
						title: entity.title
					}

					const controller = new AbortController()
					config.signal.addEventListener('abort', () => {
						controller.abort(config.signal.reason)
					})
					// LLM
					const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
						new GetXpertChatModelQuery(xpert, null, {
							abortController: controller,
							usageCallback: assignExecutionUsage(execution)
						})
					)

					// Record ai model info into execution
					execution.metadata = {
						provider: copilotModel.copilot.modelProvider?.providerName,
						model: copilotModel.model || copilotModel.copilot.copilotModel?.model
					}

					const systemMessage = await SystemMessagePromptTemplate.fromTemplate(
						`## Job Description
    You are a text classification engine that analyzes text data and assigns categories based on user input or automatically determined categories.
## Task
    Your task is to assign one categories ONLY to the input text and only one category may be assigned returned in the output. Additionally, you need to extract the key words from the text that are related to the classification.
## Format
    The input text is in the variable input_text. Categories are specified as a category list with two filed category_id and category_name in the variable categories. Classification instructions may be included to improve the classification accuracy.
## Constraint
    DO NOT include anything other than the JSON in your response.
## Categories:
${classes.map((c, i) => `- ${i + 1}: ${c.description}`).join('\n')}

${instruction ? `## User Instruction\n${instruction}` : ''}`,
						{
							templateFormat: 'mustache'
						}
					).format(stateEnv)

					return await wrapAgentExecution(
						async () => {
							const result = await chatModel
								.withStructuredOutput(
									z.object({
										category: z.number().describe('The index of the class to classify')
									})
								)
								.invoke([systemMessage, new HumanMessage(inputs.join('\n'))])
							return {
								state: {
									[channelName(node.key)]: result
								},
								output: JSON.stringify(result, null, 2)
							}
						},
						{
							commandBus: this.commandBus,
							queryBus: this.queryBus,
							subscriber: subscriber,
							execution
						}
					)()
				}),
				ends: []
			},
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				const category = (state[channelName(node.key)] as unknown as {category: number})?.category
				return nextWorkflowNodes(graph, node.key + '/category_' + category, state)
			}
		}
	}
}
