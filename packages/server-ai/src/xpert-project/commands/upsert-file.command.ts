import { TFile } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class UpsertProjectFileCommand implements ICommand {
	static readonly type = '[Xpert Project] Upsert file'

	constructor(
		public readonly projectId: string,
		public readonly file: TFile,
	) {}
}
