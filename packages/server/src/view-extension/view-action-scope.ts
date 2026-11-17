import { AsyncLocalStorage } from 'node:async_hooks'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'

type ViewActor = Pick<
	XpertResolvedViewHostContext,
	'tenantId' | 'organizationId' | 'workspaceId' | 'userId' | 'hostType' | 'hostId'
>
const active = new AsyncLocalStorage<{ context: Readonly<ViewActor>; plugin: string; open: boolean }>()

/** Retain host-resolved scalar identities only for the duration of this authorized view invocation. */
export async function withPluginViewAction<T>(
	view: XpertResolvedViewHostContext,
	plugin: string,
	run: () => Promise<T>
) {
	const { tenantId, organizationId, workspaceId, userId, hostType, hostId } = view
	const context = Object.freeze({ tenantId, organizationId, workspaceId, userId, hostType, hostId })
	const frame = { context, plugin, open: true }
	try {
		return await active.run(frame, run)
	} finally {
		frame.open = false
	}
}

export function currentPluginViewAction() {
	const frame = active.getStore()
	return frame?.open ? { context: frame.context, plugin: frame.plugin } : undefined
}
