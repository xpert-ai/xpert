import { Injectable } from '@nestjs/common'
import { HandoffMessage, LaneName, ProcessorPolicy } from '@xpert-ai/plugin-sdk'
import {
	HandoffQueueName,
	XPERT_HANDOFF_QUEUE_INTEGRATION
} from '../constants'
import {
	HandoffRouteRule,
	HandoffRoutingConfigService,
	HandoffTypePolicy
} from './handoff-routing-config.service'

export interface HandoffRouteResolution {
	queue: HandoffQueueName
	lane: LaneName
	policy: ProcessorPolicy
	typePolicy?: HandoffTypePolicy
}

@Injectable()
export class HandoffRouteResolver {
	constructor(private readonly routingConfigService: HandoffRoutingConfigService) {}

	resolve(message: HandoffMessage): HandoffRouteResolution {
		const config = this.routingConfigService.getSnapshot()
		const typePolicy = config.typePolicies[message.type]
		const matchedRoute = this.resolveMatchedRoute(message)
		const queue =
			this.resolveQueueFromHeader(message) ??
			typePolicy?.queue ??
			matchedRoute?.target.queue ??
			config.defaultQueue
		const lane = this.resolveLane(message, typePolicy, matchedRoute, config.defaultLane)
		const timeoutMs = this.resolveTimeoutMs(message, typePolicy, matchedRoute)
		const policy: ProcessorPolicy =
			timeoutMs === undefined
				? { lane }
				: {
						lane,
						timeoutMs
				  }

		return {
			queue,
			lane,
			policy,
			typePolicy
		}
	}

	private resolveQueueFromHeader(message: HandoffMessage): HandoffQueueName | undefined {
		const headerQueue = this.getQueueHeader(message)
		return this.routingConfigService.resolveQueueAlias(headerQueue)
	}

	private resolveMatchedRoute(message: HandoffMessage): HandoffRouteRule | undefined {
		const config = this.routingConfigService.getSnapshot()
		return config.routes.find((route) => this.matches(message, route))
	}

	private resolveLane(
		message: HandoffMessage,
		typePolicy: HandoffTypePolicy | undefined,
		route: HandoffRouteRule | undefined,
		defaultLane: LaneName
	): LaneName {
		return (
			this.routingConfigService.resolveLaneAlias(message.headers?.requestedLane) ??
			typePolicy?.lane ??
			route?.target.lane ??
			defaultLane
		)
	}

	private resolveTimeoutMs(
		message: HandoffMessage,
		typePolicy: HandoffTypePolicy | undefined,
		route: HandoffRouteRule | undefined
	): number | undefined {
		const timeoutHeader = message.headers?.policyTimeoutMs
		if (timeoutHeader) {
			const timeoutMs = parseInt(timeoutHeader, 10)
			if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
				return timeoutMs
			}
		}
		return typePolicy?.timeoutMs ?? route?.target.timeoutMs
	}

	private matches(message: HandoffMessage, route: HandoffRouteRule): boolean {
		const { match } = route
		if (match.type && message.type !== match.type) {
			return false
		}
		if (match.typePrefix && !message.type.startsWith(match.typePrefix)) {
			return false
		}
		if (match.tenantId && message.tenantId !== match.tenantId) {
			return false
		}
		if (match.organizationId && message.headers?.organizationId !== match.organizationId) {
			return false
		}
		if (match.source && message.headers?.source !== match.source) {
			return false
		}
		return true
	}

	private getQueueHeader(message: HandoffMessage): string | undefined {
		return message.headers?.handoffQueue || message.headers?.queue
	}
}
