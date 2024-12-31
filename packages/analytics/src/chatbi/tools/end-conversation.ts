import { tool } from '@langchain/core/tools'
import { ChatLarkContext, LarkService } from '@metad/server-ai'
import { take } from 'rxjs/operators'
import { z } from 'zod'
import { ChatBIConversation } from '../conversation'
import { C_CHATBI_END_CONVERSATION, ChatContext } from '../types'

export function createEndTool(context: ChatContext) {
	const { conversation } = context
	return tool(
		async (answer): Promise<string> => {
			await conversation.end()
			return 'The conversation is end!'
		},
		{
			name: 'end',
			description: 'End the conversation',
			schema: z.object({})
		}
	)
}

export async function errorWithEndMessage(context: ChatLarkContext & {larkService?: LarkService}, error: string, conversation: ChatBIConversation) {
	const { larkService } = context
	const data = {
		config: {
			enable_forward: false
		},
		header: {
			title: {
				tag: 'plain_text',
				content: '错误信息'
			}
		},
		elements: [
			{
				tag: 'div',
				text: {
					tag: 'plain_text',
					content: error
				}
			},
			{
				tag: 'action',
				actions: [
					{
						tag: 'button',
						text: {
							tag: 'plain_text',
							content: '结束对话'
						},
						type: 'primary',
						value: C_CHATBI_END_CONVERSATION
					}
				]
			}
		]
	}

	larkService.createAction(context, data)
		.pipe(take(1))
		.subscribe(() => {
			conversation.end()
		})
}
