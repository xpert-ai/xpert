import { ISemanticModel } from '@metad/contracts'
import { omit, pick } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { SemanticModelService } from '../../model.service'
import { SemanticModelCreateCommand } from '../semantic-model.create.command'
import { SemanticModelUpdatedEvent } from '../../events'

@CommandHandler(SemanticModelCreateCommand)
export class SemanticModelCreateHandler implements ICommandHandler<SemanticModelCreateCommand> {
	constructor(
		private readonly modelService: SemanticModelService,
		private readonly eventBus: EventBus
	) {}

	public async execute(command: SemanticModelCreateCommand): Promise<ISemanticModel> {
		const { input } = command

		let model = await this.modelService.create(omit(input, ['roles', 'queries']))

		if (model && (input.roles?.length || input.queries?.length)) {
			const userId = RequestContext.currentUserId()

			model.roles = input.roles?.map((role) => ({
				...role,
				...pick(model, ['tenantId', 'organizationId']),
				modelId: model.id,
				createdById: userId,
				updatedById: userId
			}))

			model.queries = input.queries?.map((item) => ({
				...item,
				...pick(model, ['tenantId', 'organizationId']),
				modelId: model.id,
				createdById: userId,
				updatedById: userId
			}))

			model = await this.modelService.modelRepository.save(model)
		}

		if (model) {
			this.eventBus.publish(new SemanticModelUpdatedEvent(model.id))
		}

		return model
	}
}
