import { SystemMessage } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareStrategy,
	PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { SKILLS_MIDDLEWARE_NAME } from '../../types'

@Injectable()
@AgentMiddlewareStrategy(SKILLS_MIDDLEWARE_NAME)
export class SkillsMiddleware implements IAgentMiddlewareStrategy {
	readonly meta = {
		name: SKILLS_MIDDLEWARE_NAME,
		configSchema: {
			type: 'object',
			properties: {
				systemPrompt: {
					type: 'string',
					default: '',
					description: {
						en_US: 'Custom system prompt to prepend to the default todo list middleware prompt.',
						zh_CN: '自定义系统提示，添加到默认的待办事项中间件提示之前。'
					}
				}
			}
		}
	}

	createMiddleware(options: { systemPrompt?: string }): PromiseOrValue<AgentMiddleware> {
		return {
			name: SKILLS_MIDDLEWARE_NAME,
			wrapModelCall: (request, handler) => {
				const systemMessage = request.systemMessage
				const _content =
					typeof systemMessage === 'string' ? systemMessage : ((systemMessage?.content as string) ?? '')
				return handler({
					...request,
					systemMessage: new SystemMessage(_content.concat(`\n\n${options?.systemPrompt ?? ''}`))
				})
			}
		}
	}
}
