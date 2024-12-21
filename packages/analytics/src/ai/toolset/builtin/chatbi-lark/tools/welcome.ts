import { tool } from '@langchain/core/tools'
import { ChatMessageTypeEnum, JSONValue } from '@metad/contracts'
import { ChatLarkMessage } from '@metad/server-ai'
import { shortuuid } from '@metad/server-common'
import { flatten, Logger } from '@nestjs/common'
import { z } from 'zod'
import { ChatBILarkContext, ChatBILarkToolsEnum } from '../types'

export function createWelcomeTool(context: Partial<ChatBILarkContext>) {
	const logger = new Logger('WelcomeTool')
	const { models: _models } = context
	return tool(
		async ({ models, more }, config): Promise<string> => {
			logger.debug(
				`[ChatBI] [Copilot Tool] [Welcome] models: ${JSON.stringify(models, null, 2)} and more: ${JSON.stringify(more, null, 2)}`
			)

			const { subscriber } = config.configurable

			const elements = []
			elements.push({
				tag: 'markdown',
				content: '猜你想问：'
			})
			elements.push(
				...flatten(
					models.map(({ modelId, cubeName, prompts }) => {
						const chatModel = _models.find(
							(model) => model.modelId === modelId && model.entity === cubeName
						)
						if (!chatModel) {
							return []
						}

						return [
							{
								tag: 'markdown',
								content: `- 关于数据集 “${chatModel.entityCaption}”, 您可能关心的问题：`
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
												const fullPrompt = `分析数据集 “${chatModel.entityCaption}”：` + prompt
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
						]
					})
				)
			)
			if (more?.length) {
				elements.push({
					tag: 'markdown',
					content: `- 更多数据集：`
				})

				elements.push({
					tag: 'column_set',
					columns: [
						{
							tag: 'column',
							width: '23px'
						},
						{
							tag: 'column',
							elements: [
								...more.map(({ modelId, cubeName }) => {
									const chatModel = _models.find(
										(model) => model.modelId === modelId && model.entity === cubeName
									)

									if (!chatModel) {
										throw new Error(`No model found for ${modelId} and ${cubeName}`)
									}

									return {
										tag: 'button',
										text: {
											tag: 'plain_text',
											content: chatModel.entityCaption
										},
										type: 'primary_text',
										complex_interaction: true,
										width: 'default',
										size: 'small',
										value: `针对数据集 “${chatModel.entityCaption}” 给出欢迎信息`
									}
								})
							]
						}
					]
				})
			}
			elements.push({
				tag: 'markdown',
				content: `您也可以对我说 “**结束对话**” 来结束本轮对话。`
			})

			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.MESSAGE,
					data: {
						id: shortuuid(),
						type: 'update',
						data: {
							elements,
							header: {
								title: {
									tag: 'plain_text',
									content: 'Hi, 我是 ChatBI, 我可以根据你的问题分析数据、生成图表'
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

			// larkMessage.update({
			// 	elements,
			// 	header: {
			// 		title: {
			// 			tag: 'plain_text',
			// 			content: 'Hi, 我是 ChatBI, 我可以根据你的问题分析数据、生成图表'
			// 		},
			// 		subtitle: {
			// 			tag: 'plain_text',
			// 			content: ''
			// 		},
			// 		template: ChatLarkMessage.headerTemplate,
			// 		icon: ChatLarkMessage.logoIcon
			// 	},
			// 	action: (action) => {
			// 		larkMessage.ask(action.value)
			// 	}
			// })

			return 'Welcome info has sent to user, waiting for user response...'
		},
		{
			name: ChatBILarkToolsEnum.WELCOME,
			description: 'Show welcome message to guidle user ask questions abount models.',
			schema: z.object({
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
