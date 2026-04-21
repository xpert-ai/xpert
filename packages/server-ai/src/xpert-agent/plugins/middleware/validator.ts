import {
	ChecklistItem,
	IWFNMiddleware,
	normalizeMiddlewareProvider,
	TAgentMiddlewareMeta,
	TXpertFeatureKey,
	TXpertFeatures,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

function isXpertFeatureEnabled(
	xpertFeatures: TXpertFeatures | null | undefined,
	feature: TXpertFeatureKey
) {
	return xpertFeatures?.[feature]?.enabled === true
}

@Injectable()
export class WorkflowMiddlewareNodeValidator {
	constructor(private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry) {}

	@OnEvent(EventNameXpertValidate)
	handle(event: XpertDraftValidateEvent) {
		const draft = event.draft
		const middlewareNodes = draft.nodes.filter(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
		)
		const items: ChecklistItem[] = []
		middlewareNodes.forEach((node) => {
			items.push(...this.check(node, draft.team.features))
		})
		return items
	}

	check(node: TXpertTeamNode, xpertFeatures?: TXpertFeatures | null) {
		const entity = node.entity as IWFNMiddleware
		const provider = normalizeMiddlewareProvider(entity.provider)
		let meta: TAgentMiddlewareMeta

		try {
			meta = this.agentMiddlewareRegistry.get(provider).meta
		} catch {
			return [
				{
					node: node.key,
					ruleCode: 'MIDDLEWARE_PROVIDER_NOT_FOUND',
					field: 'provider',
					value: provider,
					message: {
						en_US: `Middleware provider "${provider}" not found`,
						zh_Hans: `中间件提供者 "${provider}" 未找到`
					},
					level: 'error' as const
				}
			]
		}

		const requiredFeatures = Array.from(new Set(meta.features ?? []))
		if (requiredFeatures.length === 0) {
			return []
		}

		const labelEn = meta.label.en_US ?? provider
		const labelZh = meta.label.zh_Hans ?? labelEn

		return requiredFeatures
			.filter((feature) => !isXpertFeatureEnabled(xpertFeatures, feature))
			.map((feature) => ({
				node: node.key,
				ruleCode: 'MIDDLEWARE_REQUIRED_FEATURE_DISABLED',
				field: 'provider',
				value: feature,
				message: {
					en_US: `Middleware "${labelEn}" requires the xpert "${feature}" feature to be enabled`,
					zh_Hans: `中间件 "${labelZh}" 需要先开启 xpert 的 "${feature}" 功能`
				},
				level: 'error' as const
			}))
	}
}
