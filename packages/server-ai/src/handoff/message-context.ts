import {
	HandoffMessage,
	runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as runWithLegacyRequestContext } from '@xpert-ai/server-core'

export function getHandoffMessageHeader(message: HandoffMessage, key: string): string | undefined {
	const value = message.headers?.[key]
	if (typeof value === 'string' && value.length > 0) {
		return value
	}
	return undefined
}

export function getHandoffMessageOrganizationId(message: HandoffMessage): string | undefined {
	return getHandoffMessageHeader(message, 'organizationId')
}

export async function runWithHandoffMessageContext<T>(
	message: HandoffMessage,
	task: () => Promise<T>
): Promise<T> {
	const organizationId = getHandoffMessageOrganizationId(message)
	const userId = getHandoffMessageHeader(message, 'userId')
	const language = getHandoffMessageHeader(message, 'language')
	const tenantId = typeof message.tenantId === 'string' && message.tenantId.length > 0
		? message.tenantId
		: undefined
	const user = tenantId
		? ({
				id: userId ?? null,
				tenantId
		  } as any)
		: undefined
	const headers: Record<string, string> = {
		...(tenantId ? { ['tenant-id']: tenantId } : {}),
		['x-scope-level']: organizationId ? 'organization' : 'tenant',
		...(organizationId ? { ['organization-id']: organizationId } : {}),
		...(language ? { language } : {})
	}

	// Handoff jobs can run outside the producer request, so rebuild scope from the
	// message envelope before resolving processors, retries, and dead-letter records.
	return new Promise<T>((resolve, reject) => {
		runWithRequestContext({ user, headers } as any, {} as any, () => {
			runWithLegacyRequestContext({ user, headers } as any, () => {
				task().then(resolve).catch(reject)
			})
		})
	})
}
