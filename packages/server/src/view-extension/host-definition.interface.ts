import {
	XpertResolvedViewHostContext,
	XpertViewActionRequest,
	XpertViewHostContext,
	XpertViewSlot
} from '@xpert-ai/contracts'

export interface ViewExtensionFileActionFile {
	originalname?: string
	mimetype?: string
	size?: number
	buffer: Buffer
}

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

	prepareFileAction?(
		context: XpertResolvedViewHostContext,
		request: XpertViewActionRequest,
		file: ViewExtensionFileActionFile
	): Promise<XpertViewActionRequest> | XpertViewActionRequest
}
