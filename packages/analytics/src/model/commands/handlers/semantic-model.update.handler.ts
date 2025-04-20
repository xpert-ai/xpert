import { ISemanticModel } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { pick } from 'lodash'
import { SemanticModel } from '../../model.entity'
import { SemanticModelService } from '../../model.service'
import { SemanticModelRoleService } from '../../role/role.service'
import { SemanticModelUpdateCommand } from '../semantic-model.update.command'
import { SemanticModelUpdatedEvent } from '../../events'

@CommandHandler(SemanticModelUpdateCommand)
export class SemanticModelUpdateHandler implements ICommandHandler<SemanticModelUpdateCommand> {
	constructor(
		private readonly modelService: SemanticModelService,
		private readonly roleService: SemanticModelRoleService,
		private readonly eventBus: EventBus
		) {}

	public async execute(command: SemanticModelUpdateCommand): Promise<ISemanticModel> {
		const { input } = command
		const { id } = input
		return this.updateSemanticModel(id, input, command.relations)
	}

	private async updateSemanticModel(id: string, input: ISemanticModel, relations: string[]): Promise<ISemanticModel> {
		
		const model: ISemanticModel = await this.modelService.findOneByIdString(id, { relations: ['roles'] })

		if (model) {
			// Remove roles https://github.com/typeorm/typeorm/issues/1761
			if (input.roles) {
				for (const role of model.roles) {
					if (!input.roles.find((item) => item.id === role.id)) {
						await this.roleService.delete(role.id)
					}
				}
			}

			const userId = RequestContext.currentUserId()

			const request = {
				...model,
				...input,
				roles: input.roles?.map((role) => ({
					...role,
					...pick(model, ['tenantId', 'organizationId']),
					modelId: model.id,
					createdById: model.roles.find((item) => item.id === role.id)?.createdById ?? userId,
					updatedById: userId
				}))
			}
			await this.modelService.create({
				...request,
				id,
			} as SemanticModel)

			this.eventBus.publish(new SemanticModelUpdatedEvent(id))
		}

		return await this.modelService.findOneByIdString(id, {relations})
	}
}
