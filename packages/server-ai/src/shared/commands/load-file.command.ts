import { _TFile } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

/**
 */
export class LoadFileCommand implements ICommand {
	static readonly type = '[Shared] Load File';

	constructor(public readonly file: _TFile) {}
}
