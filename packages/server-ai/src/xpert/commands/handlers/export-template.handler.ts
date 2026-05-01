import { TXpertExportedTemplate } from '@xpert-ai/contracts'
import { yaml } from '@xpert-ai/server-common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertService } from '../../xpert.service'
import { XpertExportCommand } from '../export.command'
import { XpertExportTemplateCommand } from '../export-template.command'

@CommandHandler(XpertExportTemplateCommand)
export class XpertExportTemplateHandler implements ICommandHandler<XpertExportTemplateCommand> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly xpertTemplateService: XpertTemplateService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: XpertExportTemplateCommand): Promise<TXpertExportedTemplate> {
		const exportedDsl = await this.commandBus.execute<XpertExportCommand, object>(
			new XpertExportCommand(command.id, command.isDraft, command.includeMemory)
		)
		const dslYaml = yaml.stringify(instanceToPlain(exportedDsl))
		const xpert = await this.xpertService.findOne(command.id)
		const exportedTemplate = await this.xpertTemplateService.saveExportedXpertTemplate({
			xpert,
			dslYaml,
			isDraft: command.isDraft,
			includeMemory: !!command.includeMemory
		})

		await this.xpertService.update(command.id, { exportedTemplate })

		return exportedTemplate
	}
}
