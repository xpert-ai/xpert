import { RequestContext } from '@metad/server-core'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DeleteResult } from 'typeorm'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { SemanticModelService } from '../../model.service'
import { SemanticModelCacheDeleteCommand } from '../semantic-model-cache.delete.command'

@CommandHandler(SemanticModelCacheDeleteCommand)
export class SemanticModelCacheDeleteHandler implements ICommandHandler<SemanticModelCacheDeleteCommand> {
	constructor(
		private readonly modelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService
	) {}

	public async execute(command: SemanticModelCacheDeleteCommand): Promise<DeleteResult> {
		const { id } = command
		const tenantId = RequestContext.currentTenantId()

		const semanticModel = await this.modelService.findOneByWhereOptions({ tenantId, id })

		return await this.cacheService.delete({
			tenantId,
			modelId: id
		})
	}
}
