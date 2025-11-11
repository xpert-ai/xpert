import { QueryStatusEnum } from '@metad/contracts'
import { InjectQueue } from '@nestjs/bull'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { ModelQueryLogUpsertCommand } from '../../../model-query-log/commands'
import { QUERY_QUEUE_NAME } from '../../types'
import { SemanticModelQueryCommand } from '../model-query.command'

@CommandHandler(SemanticModelQueryCommand)
export class SemanticModelQueryHandler implements ICommandHandler<SemanticModelQueryCommand> {
	constructor(
		@InjectQueue(QUERY_QUEUE_NAME) private readonly queryQueue: Queue,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: SemanticModelQueryCommand) {
		const { input } = command
		const { sessionId, userId, data } = input
		const { id, tenantId, organizationId, dataSourceId, modelId, body, acceptLanguage, forceRefresh } = data

		let statement: string
		let query = null
		let cube = null
		if (modelId) {
			if (typeof body === 'string') {
				statement = body
			} else {
				statement = body.statement || body.mdx
				query = body.query
				query.force ??= forceRefresh
				cube = body.query.cube
			}
		} else {
			statement = body as unknown as string
		}
		const log = await this.commandBus.execute(
			new ModelQueryLogUpsertCommand({
				params: query,
				cube,
				query: statement,
				modelId,
				status: QueryStatusEnum.PENDING,
				createdById: userId,
				tenantId,
				organizationId,
				key: id
			})
		)

		await this.queryQueue.add({ sessionId, userId, logId: log.id, data })
	}
}
