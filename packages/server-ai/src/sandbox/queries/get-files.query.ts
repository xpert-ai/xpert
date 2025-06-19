import { IQuery } from '@nestjs/cqrs'

/**
 * Get file list in sandbox
 */
export class SandboxFilesQuery implements IQuery {
	static readonly type = '[Sandbox] Get file list'

	constructor(
		public readonly params: {
			tenantId: string
			userId: string
			projectId?: string
			path?: string
			deepth?: number
		}
	) {}
}
