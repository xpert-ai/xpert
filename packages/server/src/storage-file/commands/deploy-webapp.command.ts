import { ICommand } from '@nestjs/cqrs'
import { Readable } from 'stream'

export class DeployWebappCommand implements ICommand {
	static readonly type = '[StorageFile] Deploy webapp'

	constructor(
		public readonly stream: Readable,
		public readonly appId: string,
	) {}
}
