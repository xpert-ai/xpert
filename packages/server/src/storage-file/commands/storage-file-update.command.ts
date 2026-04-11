import { ICommand } from '@nestjs/cqrs';
import { IUpdateStorageFileInput } from '@xpert-ai/contracts';

export class StorageFileUpdateCommand implements ICommand {
	static readonly type = '[StorageFile] Update Storage File';

	constructor(
		public readonly input: IUpdateStorageFileInput
	) {}
}
