import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertService } from '../../xpert.service'
import { XpertDeleteExportedTemplateCommand } from '../delete-exported-template.command'

@CommandHandler(XpertDeleteExportedTemplateCommand)
export class XpertDeleteExportedTemplateHandler implements ICommandHandler<XpertDeleteExportedTemplateCommand> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly xpertTemplateService: XpertTemplateService
	) {}

	public async execute(command: XpertDeleteExportedTemplateCommand): Promise<void> {
		const xpert = await this.xpertService.findOne(command.id)
		await this.xpertTemplateService.deleteExportedXpertTemplate(xpert.exportedTemplate)

		if (xpert.exportedTemplate) {
			await this.xpertService.update(command.id, { exportedTemplate: null })
		}
	}
}
