import { AIMessage, MessageContent, MessageContentComplex, MessageContentText } from '@langchain/core/messages'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import { nanoid as _nanoid } from 'nanoid'
import { ZodType, ZodTypeDef } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { CopilotChatMessage } from './types'
import { TMessageContentComplex, TTokenUsage } from '@metad/contracts'

export function zodToAnnotations(obj: ZodType<any, ZodTypeDef, any>) {
  return (<{ properties: any }>zodToJsonSchema(obj)).properties
}

export function nanoid() {
  return _nanoid()
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null
}

export function isNil(value: unknown): value is null | undefined {
  return value == null
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String
}

export function isBlank(value: unknown) {
  return isNil(value) || (isString(value) && !value.trim())
}

export function nonBlank<T>(value: T): value is NonNullable<T> {
  return !isBlank(value)
}

/**
 * Split the prompt into command and prompt
 *
 * @param prompt
 * @returns
 */
export function getCommandPrompt(prompt: string) {
  prompt = prompt.trim()
  // a regex match `/command prompt`
  const match = prompt.match(/^\/([a-zA-Z\-]*)\s*/i)
  const command = match?.[1]

  return {
    command,
    prompt: command ? prompt.replace(`/${command}`, '').trim() : prompt
  }
}

export function referencesCommandName(commandName: string) {
  return `${commandName}/references`
}

export const AgentRecursionLimit = 20

/**
 * @deprecated use calcTokenUsage
 */
export function sumTokenUsage(output: LLMResult) {
  let tokenUsed = 0
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsed += message.usage_metadata.total_tokens
      }
    })
  })
  return tokenUsed
}

export function calcTokenUsage(output: LLMResult) {
  const tokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0} as TTokenUsage
  output.generations?.forEach((generation) => {
    generation.forEach((item) => {
      const message = (<ChatGenerationChunk>item).message as AIMessage
      if (message.usage_metadata) {
        tokenUsage.promptTokens += message.usage_metadata.input_tokens
        tokenUsage.completionTokens = message.usage_metadata.output_tokens
        tokenUsage.totalTokens = message.usage_metadata.total_tokens
      }
    })
  })
  return tokenUsage
}

// stringify MessageContent
export function stringifyMessageContent(content: MessageContent | MessageContentComplex) {
  if (typeof content === 'string') {
    return content
  } else if (Array.isArray(content)) {
    return content.map(stringifyMessageContent).join('\n\n')
  } else if (content) {
    if (content.type === 'text') {
      return content.text
    } else if (content.type === 'component') {
      return JSON.stringify(content['data'])
    } else {
      return JSON.stringify(content)
    }
  }
  return ''
}

/**
 * Append content into AI Message
 * 
 * @param aiMessage 
 * @param content 
 */
export function appendMessageContent(aiMessage: CopilotChatMessage, content: string | TMessageContentComplex) {
  aiMessage.status = 'answering'
	const _content = aiMessage.content
	if (typeof content === 'string') {
		if (typeof _content === 'string') {
			aiMessage.content = _content + content
		} else if (Array.isArray(_content)) {
			const lastContent = _content[_content.length - 1]
			if (lastContent.type === 'text') {
				lastContent.text = lastContent.text + content
			} else {
				_content.push({
					type: 'text',
					text: content
				})
			}
		} else {
			aiMessage.content = content
		}
	} else {
    if ((<any>content).type === 'reasoning') {
      aiMessage.reasoning ??= ''
      aiMessage.reasoning += (<any>content).content
      aiMessage.status = 'reasoning'
    } else {
      if (Array.isArray(_content)) {
        // Merge text content by id
        if (content.type === 'text' && content.id) {
          const index = _content.findIndex((_) => _.type === 'text' && _.id === content.id)
          if (index > -1) {
            (<MessageContentText>_content[index]).text += content.text
          } else {
            _content.push(content)
          }
        } else {
          _content.push(content)
        }
      } else if(_content) {
        aiMessage.content = [
          {
            type: 'text',
            text: _content
          },
          content
        ]
      } else {
        aiMessage.content = [
          content
        ]
      }
    }
	}
}

export function estimateTokenUsage(text: string) {
  const characterCount = text?.length ?? 0 // 获取字符数
  const tokens = Math.ceil(characterCount / 4) // 估算token数（以4为基准）
  return tokens
}