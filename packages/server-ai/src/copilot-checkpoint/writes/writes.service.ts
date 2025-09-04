import { SerializerProtocol } from '@langchain/langgraph-checkpoint'
import { JsonPlusSerializer } from '../serde/jsonplus'
import { ICopilotCheckpointWrites } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotCheckpointWrites } from './writes.entity'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'

@Injectable()
export class CopilotCheckpointWritesService extends TenantOrganizationAwareCrudService<CopilotCheckpointWrites> {
	serde: SerializerProtocol = new JsonPlusSerializer()

	constructor(
		@InjectRepository(CopilotCheckpointWrites)
		repository: Repository<CopilotCheckpointWrites>
	) {
		super(repository)
	}

	async upsert(entities: Partial<ICopilotCheckpointWrites>[]) {
		await this.repository.manager.transaction(async (transactionalEntityManager) => {
			let idx = 0
			for await (const entity of entities) {
				const [type, serializedWrite] = await this.serde.dumpsTyped(entity.value)
				await transactionalEntityManager.upsert(
					CopilotCheckpointWrites,
					{
						...entity,
						idx,
						type,
						value: serializedWrite,
						tenantId: RequestContext.currentTenantId(),
						organizationId: RequestContext.getOrganizationId()
					},
					{
						conflictPaths: [
							'organizationId',
							'thread_id',
							'checkpoint_ns',
							'checkpoint_id',
							'task_id',
							'idx'
						]
					}
				)
				idx++
			}
		})
	}

	async deleteByThreadId(threadId: string): Promise<void> {
		await this.delete({ thread_id: threadId })
	}
}
