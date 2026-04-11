import { ICommand } from '@nestjs/cqrs';
import { IImportRecord, IImportRecordFind } from '@xpert-ai/contracts';

export class ImportRecordUpdateOrCreateCommand implements ICommand {
	static readonly type = '[Find Or Create] Import Record';

	constructor(
		public readonly find: IImportRecordFind,
		public readonly input?: IImportRecord
	) {}
}