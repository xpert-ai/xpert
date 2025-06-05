import { TFile } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Create or update a file attachment for conversation
 * 
 */
export class ConvFileUpsertCommand implements ICommand {
	static readonly type = '[Chat Conversation] Upsert file'

	constructor(
		public readonly id: string,
		public readonly file: TFile
	) {}
}
