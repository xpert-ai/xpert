import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated use `SandboxAcquireBackendCommand` instead
 */
export class SandboxLoadCommand implements ICommand {
	static readonly type = '[Sandbox] Load'

	constructor(
		public readonly params: {
			userId?: string
			projectId?: string
			isReadonly?: boolean
			/**
			 * Init scripts of container
			 */
			initScripts?: string[]
		}
	) {}
}
