import { ICommand } from '@nestjs/cqrs'

export class SandboxLoadCommand implements ICommand {
	static readonly type = '[Sandbox] Load'

	constructor(
		public readonly userId?: string,
		public readonly isReadonly?: boolean,
	) {}
}
