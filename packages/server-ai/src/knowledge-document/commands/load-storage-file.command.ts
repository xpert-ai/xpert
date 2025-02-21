import { ICommand } from '@nestjs/cqrs';

export class LoadStorageFileCommand implements ICommand {
	static readonly type = '[KnowledgeDocument] Load StorageFile';

	constructor(public readonly id: string) {}
}
