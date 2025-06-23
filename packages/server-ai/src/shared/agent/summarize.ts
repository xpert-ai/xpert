import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, isHumanMessage, RemoveMessage } from '@langchain/core/messages'
import { channelName, TMessageChannel, TSummarize } from '@metad/contracts'
import { v4 as uuidv4 } from 'uuid'
import { AgentStateAnnotation } from './state'

export function createSummarizeAgent(model: BaseChatModel, summarize: TSummarize, agentKey?: string) {
	return async (state: typeof AgentStateAnnotation.State): Promise<Partial<typeof AgentStateAnnotation.State>> => {
		const channel = channelName(agentKey)
		// First, we summarize the conversation
		const summary = (<TMessageChannel>state[channel]).summary
		const messages = (<TMessageChannel>state[channel]).messages
		let summaryMessage: string
		if (summary) {
			// If a summary already exists, we use a different system prompt
			// to summarize it than if one didn't
			summaryMessage =
				`This is summary of the conversation to date: ${summary}\n\n` +
				(summarize.prompt
					? summarize.prompt
					: 'Extend the summary by taking into account the new messages above:')
		} else {
			summaryMessage = summarize.prompt ? summarize.prompt : 'Create a summary of the conversation above:'
		}

		const allMessages = [
			...messages,
			new HumanMessage({
				id: uuidv4(),
				content: summaryMessage
			})
		]
		const response = await model.invoke(allMessages, { tags: ['summarize_conversation'] })
		// We now need to delete messages that we no longer want to show up
		const summarizedMessages = messages.slice(0, -summarize.retainMessages)
		const retainMessages = messages.slice(-summarize.retainMessages)
		while (!isHumanMessage(retainMessages[0]) && summarizedMessages.length) {
			const lastSummarizedMessage = summarizedMessages.pop()
			retainMessages.unshift(lastSummarizedMessage)
		}
		const deleteMessages = summarizedMessages.map((m) => new RemoveMessage({ id: m.id as string }))
		if (typeof response.content !== 'string') {
			throw new Error('Expected a string summary of response from the model')
		}
		return {
			summary: response.content,
			[channel]: {
				summary: response.content,
				messages: deleteMessages
			}
		}
	}
}
