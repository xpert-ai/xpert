import { ICommand } from '@nestjs/cqrs';

export class LoadStorageFileCommand implements ICommand {
	static readonly type = '[Shared] Load StorageFile';

	constructor(public readonly id: string) {}
}
