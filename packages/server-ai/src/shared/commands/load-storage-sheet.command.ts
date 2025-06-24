import { ICommand } from '@nestjs/cqrs';

export class LoadStorageSheetCommand implements ICommand {
	static readonly type = '[Shared] Load StorageFile Sheet';

	constructor(public readonly id: string) {}
}
