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

export interface ViewHostResolutionOptions {
	isDraft?: boolean
}

export interface ViewHostDefinitionContract {
	readonly hostType: string
	readonly slots: XpertViewSlot[]

	resolve(
		hostId: string,
		options?: ViewHostResolutionOptions
	): Promise<ViewHostResolution | null> | ViewHostResolution | null

	canRead(
		context: XpertViewHostContext,
		resolution: ViewHostResolution,
		options?: ViewHostResolutionOptions
	): Promise<boolean> | boolean

	prepareFileAction?(
		context: XpertResolvedViewHostContext,
		request: XpertViewActionRequest,
		file: ViewExtensionFileActionFile
	): Promise<XpertViewActionRequest> | XpertViewActionRequest
}
