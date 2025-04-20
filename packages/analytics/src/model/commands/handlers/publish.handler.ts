import { ISemanticModel } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { assign, compact, omit } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { SemanticModelService } from '../../model.service'
import { SemanticModelPublishCommand } from '../publish.command'
import { SemanticModelUpdateCommand } from '../semantic-model.update.command'

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

		const model = await this.service.findOne(id)
		if (model.draft) {
			assign(model, omit(model.draft, 'savedAt', 'schema', 'settings'))
			model.options = {
				schema: model.draft.schema,
				settings: model.draft.settings
			}
		}
		
		model.releaseNotes = compact([model.releaseNotes, notes]).join('\n')
		model.publishAt = new Date()
		model.draft = null

		return await this.commandBus.execute(new SemanticModelUpdateCommand(model, ['roles']))
	}
}
