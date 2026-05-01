import { ICommand } from '@nestjs/cqrs'

export class XpertDeleteExportedTemplateCommand implements ICommand {
	static readonly type = '[Xpert] Delete Exported Template'

	constructor(public readonly id: string) {}
}
