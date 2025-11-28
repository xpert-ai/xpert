import { SystemMessage } from '@langchain/core/messages'
import { Injectable } from '@nestjs/common'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareStrategy,
	PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { SKILLS_MIDDLEWARE_NAME } from '../../types'
import { TAgentMiddlewareMeta } from '@metad/contracts'

@Injectable()
@AgentMiddlewareStrategy(SKILLS_MIDDLEWARE_NAME)
export class SkillsMiddleware implements IAgentMiddlewareStrategy {
	readonly meta: TAgentMiddlewareMeta = {
		name: SKILLS_MIDDLEWARE_NAME,
		label: {
			en_US: 'Skills Middleware',
			zh_Hans: '技能中间件'
		},
		icon: {
			type: 'svg',
			value: `<svg class="svg-icon" style="fill: currentColor;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M448.512 479.232a54.272 54.272 0 1 1 56.32-55.296 55.296 55.296 0 0 1-56.32 55.296z m343.04 91.136l-73.728-110.592V450.56a245.76 245.76 0 0 0-244.736-245.76 225.28 225.28 0 0 0-58.368 7.168A244.736 244.736 0 0 0 228.352 450.56a224.256 224.256 0 0 0 36.864 130.048c43.008 61.44 71.68 110.592 54.272 177.152a47.104 47.104 0 0 0 9.216 43.008 45.056 45.056 0 0 0 36.864 18.432h200.704a48.128 48.128 0 0 0 48.128-38.912 51.2 51.2 0 0 0 2.048-12.288 24.576 24.576 0 0 1 24.576-20.48H655.36a48.128 48.128 0 0 0 48.128-34.816 422.912 422.912 0 0 0 15.36-98.304h52.224a28.672 28.672 0 0 0 22.528-16.384 29.696 29.696 0 0 0-2.048-27.648z m-202.752-86.016l-10.24 16.384a22.528 22.528 0 0 1-18.432 9.216 24.576 24.576 0 0 1-7.168-1.024l-26.624-10.24a118.784 118.784 0 0 1-39.936 22.528l-5.12 29.696a20.48 20.48 0 0 1-20.48 16.384h-20.48a20.48 20.48 0 0 1-20.48-16.384l-4.096-29.696a102.4 102.4 0 0 1-37.888-20.48l-28.672 10.24a24.576 24.576 0 0 1-8.192 1.024 21.504 21.504 0 0 1-17.408-10.24l-10.24-16.384a19.456 19.456 0 0 1 5.12-25.6l23.552-19.456a103.424 103.424 0 0 1-3.072-21.504 96.256 96.256 0 0 1 3.072-20.48l-23.552-20.48a19.456 19.456 0 0 1-5.12-25.6l10.24-17.408a20.48 20.48 0 0 1 18.432-10.24 24.576 24.576 0 0 1 7.168 2.048l28.672 10.24a117.76 117.76 0 0 1 37.888-21.504L419.84 286.72a19.456 19.456 0 0 1 20.48-16.384h20.48a19.456 19.456 0 0 1 20.48 15.36l5.12 29.696a115.712 115.712 0 0 1 37.888 20.48l28.672-10.24a24.576 24.576 0 0 1 7.168-2.048 21.504 21.504 0 0 1 18.432 10.24l10.24 16.384a20.48 20.48 0 0 1-5.12 26.624l-23.552 19.456a98.304 98.304 0 0 1 2.048 21.504 96.256 96.256 0 0 1-2.048 20.48l23.552 19.456a20.48 20.48 0 0 1 5.12 26.624z"  /></svg>`,
			color: '#00d2e6'
		},
		description: {
			en_US: 'A middleware that allows adding custom system prompts to the agent\'s requests.',
			zh_Hans: '一个中间件，允许向代理的请求添加自定义系统提示。'
		},
		configSchema: {
			type: 'object',
			properties: {
				systemPrompt: {
					type: 'string',
					default: '',
					description: {
						en_US: 'Custom system prompt to prepend to the default todo list middleware prompt.',
						zh_Hans: '自定义系统提示，添加到默认的待办事项中间件提示之前。'
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
