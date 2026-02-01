import { Document } from '@langchain/core/documents'
import { _TFile } from '@metad/contracts';
import { Command } from '@nestjs/cqrs';

/**
 */
export class LoadFileCommand extends Command<Document[]> {
	static readonly type = '[Shared] Load File';

	constructor(public readonly file: _TFile) {
		super()
	}
}
