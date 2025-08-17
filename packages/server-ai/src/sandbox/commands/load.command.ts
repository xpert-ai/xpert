import { ICommand } from '@nestjs/cqrs'

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
