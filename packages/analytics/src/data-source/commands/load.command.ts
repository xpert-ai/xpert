import { CreationTable } from '@xpert-ai/adapter'
import { ICommand } from '@nestjs/cqrs'

export class DataLoadCommand implements ICommand {
	static readonly type = '[Data] Load'

	constructor(public readonly input: {
		id: string,
		sheets: CreationTable[],
		file: Express.Multer.File
	}) {}
}
