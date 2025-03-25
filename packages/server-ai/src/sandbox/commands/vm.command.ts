import { ICommand } from '@nestjs/cqrs'

export class SandboxVMCommand implements ICommand {
	static readonly type = '[Sandbox] VM'

	constructor(
		public readonly code: string,
		public readonly parameters: Record<string, any>,
		public readonly userId?: string,
		public readonly language?: 'javascript' | 'python',
	) {}
}
