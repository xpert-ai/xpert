import { type MessageContent, type MessageContentComplex } from '@langchain/core/messages'
import { TMessageContentText } from '@metad/contracts'

type TTextMessageContentPart = MessageContentComplex & {
	type: 'text' | 'text_delta'
	text: string
}

export interface IStreamTextChunk extends TMessageContentText {
	id?: string
	agentKey?: string
	xpertName?: string
	created_date?: Date
}

export interface ICreateTextChunkOptions {
	streamId?: string
	agentKey?: string
	xpertName?: string
	createdDate?: Date
}

function isTextMessageContentPart(part: MessageContentComplex): part is TTextMessageContentPart {
	return (
		typeof part === 'object' &&
		part !== null &&
		'type' in part &&
		(part.type === 'text' || part.type === 'text_delta') &&
		'text' in part &&
		typeof part.text === 'string'
	)
}

export function extractTextFromMessageContent(content: MessageContent | null | undefined): string {
	if (typeof content === 'string') {
		return content
	}
	if (!Array.isArray(content)) {
		return ''
	}

	return content
		.filter(isTextMessageContentPart)
		.map((item) => item.text)
		.join('')
}

export function createTextChunk(
	content: MessageContent | null | undefined,
	options: ICreateTextChunkOptions = {}
): IStreamTextChunk | null {
	const text = extractTextFromMessageContent(content)
	if (!text) {
		return null
	}

	const chunk: IStreamTextChunk = {
		type: 'text',
		text,
		created_date: options.createdDate ?? new Date()
	}

	if (options.streamId) {
		chunk.id = options.streamId
	}
	if (options.agentKey) {
		chunk.agentKey = options.agentKey
	}
	if (options.xpertName) {
		chunk.xpertName = options.xpertName
	}

	return chunk
}
