import { XpertViewHostContext, XpertViewSlot } from '@xpert-ai/contracts'

export interface ViewHostResolution {
	workspaceId?: string | null
	hostSnapshot?: unknown
	context?: Record<string, unknown>
}

export interface ViewHostDefinitionContract {
	readonly hostType: string
	readonly slots: XpertViewSlot[]

	resolve(hostId: string): Promise<ViewHostResolution | null> | ViewHostResolution | null

	canRead(context: XpertViewHostContext, resolution: ViewHostResolution): Promise<boolean> | boolean
}
