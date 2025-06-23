import { TFile } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

export class StorageFileCreateCommand implements ICommand {
	static readonly type = '[StorageFile] Create Storage File';

	constructor(public readonly file: TFile) {}
}
