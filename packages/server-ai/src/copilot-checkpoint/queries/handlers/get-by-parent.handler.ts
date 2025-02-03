import { type SerializerProtocol } from '@langchain/langgraph-checkpoint'
import { ICopilotCheckpoint } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointService } from '../../copilot-checkpoint.service'
import { JsonPlusSerializer } from '../../serde'
import { GetCopilotCheckpointsByParentQuery } from '../get-by-parent.query'

@QueryHandler(GetCopilotCheckpointsByParentQuery)
export class GetCopilotCheckpointsByParentHandler implements IQueryHandler<GetCopilotCheckpointsByParentQuery> {
	serde: SerializerProtocol = new JsonPlusSerializer()

	constructor(private readonly service: CopilotCheckpointService) {}

	public async execute(command: GetCopilotCheckpointsByParentQuery): Promise<ICopilotCheckpoint[]> {
		const { items } = await this.service.findAll({
			where: {
				thread_id: command.configurable.thread_id,
				checkpoint_ns: command.configurable.checkpoint_ns,
				parent_id: command.configurable.checkpoint_id
			}
		})
		return items
	}
}
