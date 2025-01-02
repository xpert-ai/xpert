import { tool } from '@langchain/core/tools'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageTypeEnum, JSONValue } from '@metad/contracts'
import { ChatLarkMessage } from '@metad/server-ai'
import { shortuuid } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { z } from 'zod'
import { ChatBILarkContext, ChatBILarkToolsEnum } from '../types'
import { AbstractChatBIToolset } from '../../chatbi/chatbi-toolset'

export function createWelcomeTool(chatbi: AbstractChatBIToolset, context: Partial<ChatBILarkContext>) {
	const logger = new Logger('WelcomeTool')
	const { models: _models } = context
	
	return tool(
		async ({ language, models, more }, config: LangGraphRunnableConfig) => {
			logger.debug(
				`[ChatBI] [Welcome] Language: ${language}, models: ${JSON.stringify(models, null, 2)} and more: ${JSON.stringify(more, null, 2)}`
			)

			const { subscriber } = config.configurable

			const elements = []
			elements.push({
				tag: 'markdown',
				content: await chatbi.translate('toolset.ChatBI.GuessAsk', { lang: language })
			})

			for await (const model of models) {
				const {modelId, cubeName, prompts} = model
				const chatModel = _models.find(
					(model) => model.modelId === modelId && model.entity === cubeName
				)
				if (!chatModel) {
					throw new Error(await chatbi.translate('toolset.ChatBI.Error.NoModel', { lang: language, args: {model: modelId, cube: cubeName} }))
				}

				const questionPrefix = await chatbi.translate('toolset.ChatBI.AnalyzeDataset', { lang: language, args: {cube: chatModel.entityCaption} })

				elements.push(
					{
						tag: 'markdown',
						content: `- ` + await chatbi.translate('toolset.ChatBI.QuestionsAboutDataset',
									{
										lang: language,
										args: {
											cube: chatModel.entityCaption
										}
									})
					},
					{
						tag: 'column_set',
						columns: [
							{
								tag: 'column',
								width: '23px'
							},
							{
								tag: 'column',
								elements: [
									...prompts.map((prompt) => {
										const fullPrompt = questionPrefix + prompt
										return {
											tag: 'button',
											text: {
												tag: 'plain_text',
												content: prompt
											},
											type: 'primary_text',
											complex_interaction: true,
											width: 'default',
											size: 'small',
											value: fullPrompt,
											hover_tips: {
												tag: 'plain_text',
												content: fullPrompt
											}
										}
									})
								]
							}
						]
					}
				)
			}

			if (more?.length) {
				elements.push({
					tag: 'markdown',
					content: await chatbi.translate('toolset.ChatBI.MoreDatasets', { lang: language })
				})

				const columnSet = []
				for await (const model of more) {
					const { modelId, cubeName } = model
					const chatModel = _models.find(
						(model) => model.modelId === modelId && model.entity === cubeName
					)

					if (!chatModel) {
						throw new Error(await chatbi.translate('toolset.ChatBI.Error.NoModel', { lang: language, args: {model: modelId, cube: cubeName} }))
					}

					const welcomeMessage = await chatbi.translate('toolset.ChatBI.GiveWelcomeMessage', {lang: language, args: {cube: chatModel.entityCaption}})

					columnSet.push({
						tag: 'button',
						text: {
							tag: 'plain_text',
							content: chatModel.entityCaption
						},
						type: 'primary_text',
						complex_interaction: true,
						width: 'default',
						size: 'small',
						value: welcomeMessage
					})
				}

				elements.push({
					tag: 'column_set',
					columns: [
						{
							tag: 'column',
							width: '23px'
						},
						{
							tag: 'column',
							elements: columnSet
						}
					]
				})
			}

			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.MESSAGE,
					data: {
						id: shortuuid(),
						type: 'update',
						data: {
							language,
							elements,
							header: {
								title: {
									tag: 'plain_text',
									content: await chatbi.translate('toolset.ChatBI.Welcome', {lang: language,})
								},
								subtitle: {
									tag: 'plain_text',
									content: ''
								},
								template: ChatLarkMessage.headerTemplate,
								icon: ChatLarkMessage.logoIcon
							}
						} as unknown as JSONValue
					}
				}
			})

			const toolCallId = config.metadata.tool_call_id
			return new Command({
				update: {
					sys_language: language,
					// update the message history
					messages: [
						{
							role: 'tool',
							content: '',
							tool_call_id: toolCallId
						}
					]
				}
			})
		},
		{
			name: ChatBILarkToolsEnum.WELCOME,
			description: 'Show welcome message to guidle user ask questions abount models.',
			schema: z.object({
				language: z.enum(['en', 'zh']).describe('Language ​​used by user'),
				models: z
					.array(
						z.object({
							modelId: z.string().describe('The model id'),
							cubeName: z.string().describe('The name of cube'),
							prompts: z.array(z.string().describe('The suggestion prompt to analysis the data model'))
						})
					)
					.describe('Top 3 models'),
				more: z
					.array(
						z
							.object({
								modelId: z.string().describe('The model id'),
								cubeName: z.string().describe('The name of cube')
							})
							.optional()
							.describe('Model cube')
					)
					.describe('The more models')
			})
		}
	)
}
