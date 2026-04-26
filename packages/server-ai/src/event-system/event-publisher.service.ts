import { Injectable, Logger } from '@nestjs/common'
import {
	XpertEvent,
	XpertEventCreateInput,
	XpertEventMeta,
	XpertEventRecord,
	XpertEventScope
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { randomUUID } from 'crypto'
import { XpertEventStreamService } from './event-stream.service'

@Injectable()
export class XpertEventPublisher {
	readonly #logger = new Logger(XpertEventPublisher.name)

	constructor(private readonly streamService: XpertEventStreamService) {}

	async publish<TPayload = unknown>(input: XpertEventCreateInput<TPayload>): Promise<XpertEventRecord<TPayload> | null> {
		const tenantId = this.resolveTenantId(input.meta)
		if (!tenantId) {
			this.#logger.warn(`Skipped Xpert event "${input.type}" because tenantId could not be resolved`)
			return null
		}

		const event: XpertEvent<TPayload> = {
			id: randomUUID(),
			type: input.type,
			version: input.version ?? 1,
			scope: this.compactScope(input.scope),
			source: input.source,
			payload: input.payload,
			meta: this.resolveMeta(input.meta, tenantId),
			timestamp: Date.now()
		}

		return (await this.streamService.appendEvent(tenantId, event)) as XpertEventRecord<TPayload> | null
	}

	private resolveTenantId(meta?: XpertEventMeta) {
		return this.normalizeString(meta?.tenantId) ?? this.safeCurrentTenantId()
	}

	private resolveMeta(meta: XpertEventMeta | undefined, tenantId: string): XpertEventMeta {
		return {
			...(meta ?? {}),
			tenantId,
			organizationId:
				meta && 'organizationId' in meta ? meta.organizationId : this.safeCurrentOrganizationId(),
			userId: meta && 'userId' in meta ? meta.userId : this.safeCurrentUserId()
		}
	}

	private compactScope(scope?: XpertEventScope): XpertEventScope {
		if (!scope) {
			return {}
		}

		const compacted: XpertEventScope = {}
		for (const key of Object.keys(scope) as Array<keyof XpertEventScope>) {
			const value = this.normalizeString(scope[key])
			if (value) {
				compacted[key] = value
			}
		}
		return compacted
	}

	private normalizeString(value: unknown) {
		if (typeof value !== 'string') {
			return undefined
		}
		const normalized = value.trim()
		return normalized || undefined
	}

	private safeCurrentTenantId() {
		try {
			return this.normalizeString(RequestContext.currentTenantId())
		} catch {
			return undefined
		}
	}

	private safeCurrentOrganizationId() {
		try {
			return RequestContext.getOrganizationId()
		} catch {
			return null
		}
	}

	private safeCurrentUserId() {
		try {
			return RequestContext.currentUserId()
		} catch {
			return null
		}
	}
}
