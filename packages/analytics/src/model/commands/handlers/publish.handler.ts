import { ISemanticModel } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { compact } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { SemanticModelService } from '../../model.service'
import { SemanticModelPublishCommand } from '../publish.command'
import { SemanticModelUpdateCommand } from '../semantic-model.update.command'
import { applySemanticModelDraft } from '../../helper'

@CommandHandler(SemanticModelPublishCommand)
export class SemanticModelPublishHandler implements ICommandHandler<SemanticModelPublishCommand> {
	readonly #logger = new Logger(SemanticModelPublishHandler.name)

	constructor(
		private readonly service: SemanticModelService,
		private readonly i18nService: I18nService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: SemanticModelPublishCommand): Promise<ISemanticModel> {
		const { id, notes } = command

		// Clear semantic model cache
		await this.service.clearOne4Ocap(id)

		const model = await this.service.findOne(id)
		// Keep the embedded state, that is, publish without requiring re-embedding
		const embedded = model.options?.embedded
		applySemanticModelDraft(model)
		model.releaseNotes = compact([model.releaseNotes, notes]).join('\n')
		model.publishAt = new Date()
		model.options ??= {}
		model.options.embedded = embedded
		return await this.commandBus.execute(new SemanticModelUpdateCommand(model, ['roles']))
	}
}
