import { AIMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs'
import {
  TMessageContent,
  TMessageContentComplex,
  TMessageContentComponent,
  TMessageContentReasoning,
  TMessageContentText,
  TTokenUsage
} from '@metad/contracts'
import { nanoid as _nanoid } from 'nanoid'
import { ZodSchema } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import omitBy from 'lodash/omitBy'
import { CopilotChatMessage } from './types'

export function zodToAnnotations(obj: ZodSchema) {
  return (<{ properties: any }>zodToJsonSchema(obj as any)).properties
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
  // eslint-disable-next-line no-useless-escape
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
  const tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as TTokenUsage
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
export function stringifyMessageContent(content: TMessageContent | TMessageContentComplex) {
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
    if ((<TMessageContentReasoning>content).type === 'reasoning') {
      const reasoning = <TMessageContentReasoning>content
      aiMessage.reasoning ??= []
      if (aiMessage.reasoning[aiMessage.reasoning.length - 1]?.id === reasoning.id) {
        aiMessage.reasoning[aiMessage.reasoning.length - 1].text += reasoning.text
      } else {
        aiMessage.reasoning.push(reasoning)
      }
      aiMessage.reasoning = Array.from(aiMessage.reasoning)
      aiMessage.status = 'reasoning'

      // if (Array.isArray(_content)) {
      //   const index = _content.findIndex((_) => _.type === 'reasoning' && _.id === content.id)
      //     if (index > -1) {
      //       (<TMessageContentReasoning>_content[index]).text += (<TMessageContentReasoning>content).text
      //     } else {
      //       _content.push(content)
      //     }
      // } else if(_content) {
      //   aiMessage.content = [
      //     {
      //       type: 'text',
      //       text: _content
      //     },
      //     content
      //   ]
      // } else {
      //   aiMessage.content = [
      //     content
      //   ]
      // }
    } else {
      if (Array.isArray(_content)) {
        // Merge text content by id
        if (content.type === 'text' && content.id) {
          const index = _content.findIndex((_) => _.type === 'text' && _.id === content.id)
          if (index > -1) {
            _content[index] = {
              ..._content[index],
              text: (<TMessageContentText>_content[index]).text + content.text
            }
          } else {
            _content.push(content)
          }
        } else {
          const index = _content.findIndex((_) => _.type === 'component' && _.id === content.id)
          if (index > -1) {
            _content[index] = {
              ..._content[index],
              ...content,
              data: {
                ...(<TMessageContentComponent>_content[index]).data,
                ...omitBy((<TMessageContentComponent>content).data, isNil),
                created_date:
                  (<TMessageContentComponent>_content[index]).data.created_date ||
                  (<TMessageContentComponent>content).data.created_date
              }
            }
          } else {
            _content.push(content)
          }
        }
      } else if (_content) {
        aiMessage.content = [
          {
            type: 'text',
            text: _content
          },
          content
        ]
      } else {
        aiMessage.content = [content]
      }
    }
  }
}

/**
 * @deprecated use countTokensSafe in @xpert-ai/plugin-sdk
 */
export function estimateTokenUsage(text: string) {
  const characterCount = text?.length ?? 0 // 获取字符数
  const tokens = Math.ceil(characterCount / 4) // 估算token数（以4为基准）
  return tokens
}

export function filterMessageText(content: TMessageContent | TMessageContentComplex) {
  if (typeof content === 'string') {
    return content
  } else if (Array.isArray(content)) {
    return content.map(filterMessageText).filter(nonNullable).join('\n\n')
  } else if (content) {
    if (content.type === 'text') {
      return content.text
    } else if (content.type === 'component') {
      return null
    } else {
      return null
    }
  }
  return null
}
