import { estimateTokenUsage } from '@metad/copilot'
import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { GetDimensionMembersCommand } from '../model-member/commands'
import { SemanticModelMemberService } from '../model-member/member.service'
import { SemanticModelService } from '../model/model.service'
import { ModelEntityUpdateCommand } from './commands'
import { SemanticModelEntityService } from './entity.service'
import { JOB_ENTITY_SYNC, MEMBERS_SYNC_NAME } from './types'
import { CreateVectorStoreCommand } from '../model-member/commands/'

const batchSize = 50

type TDimensionMembersSyncJob = {
	tenantId: string
	organizationId: string
	createdById: string
	modelId: string
	entityId: string
	cube: string
	hierarchies: string[]
}

@Processor(JOB_ENTITY_SYNC)
export class EntityMemberProcessor {
	private readonly logger = new Logger(EntityMemberProcessor.name)

	constructor(
		private readonly entityService: SemanticModelEntityService,
		private readonly memberService: SemanticModelMemberService,
		private readonly modelService: SemanticModelService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Process(MEMBERS_SYNC_NAME)
	async handleSyncMembers(job: Job<TDimensionMembersSyncJob>) {
		const { tenantId, organizationId, createdById, modelId, entityId, cube, hierarchies } = job.data
		this.logger.debug(
			`[Job: entity '${job.id}'] Start sync dimension memebrs for model '${modelId}' and cube '${cube}' ...`
		)

		try {
			const entity = await this.entityService.findOne(entityId)
			const model = await this.modelService.findOne(modelId, {
				where: { tenantId, organizationId },
				relations: ['dataSource', 'dataSource.type', 'roles']
			})
			const { entityType, members, statistics } = await this.commandBus.execute(
				new GetDimensionMembersCommand(model, cube, hierarchies, entityId)
			)

			// the copilot of the organization where the semantic model is located
			// const copilot = await this.queryBus.execute(
			// 	new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding)
			// )

			// if (!copilot) {
			// 	throw new CopilotNotFoundException(`Copilot not found for role '${AiProviderRole.Embedding}'`)
			// }
			// const vectorStore = await this.memberService.getVectorStore(copilot, model.id, entityType.name)
			const id = model.id ? `${model.id}${entityType.name ? ':' + entityType.name : ''}` : 'default'
			const vectorStore = await this.commandBus.execute(new CreateVectorStoreCommand(id))
			await vectorStore?.clear()

			let count = 0
			while (batchSize * count < members.length) {
				const batch = members.slice(batchSize * count, batchSize * (count + 1))
				// Record token usage
				const tokenUsed = batch.reduce((total, doc) => total + estimateTokenUsage(doc.pageContent), 0)

				// await this.commandBus.execute(
				// 	new CopilotTokenRecordCommand({
				// 		tenantId,
				// 		organizationId,
				// 		userId: createdById,
				// 		copilotId: copilot.id,
				// 		tokenUsed,
				// 		model: getCopilotModel(copilot)
				// 	})
				// )

				const entities = await this.memberService.bulkCreate(model, cube, batch)
				if (vectorStore) {
					await vectorStore.addMembers(entities, entityType)
					await Promise.all(entities.map((entity) => this.memberService.update(entity.id, { vector: true })))
				}

				count++
				const progress =
					batchSize * count >= members.length
						? 100
						: (((batchSize * count) / members.length) * 100).toFixed(1)
				this.logger.debug(`Embeddings members for dimensions '${hierarchies}' progress: ${progress}%`)

				// Check the job status
				if (await this.checkIfJobCancelled(job)) {
					this.logger.debug(`[Job: entity '${job.id}'] Cancelled`)
					return
				}
				await this.commandBus.execute(
					new ModelEntityUpdateCommand({
						id: entityId,
						job: {
							...entity.job,
							id: job.id,
							status: 'processing',
							progress: Number(progress)
						}
					})
				)
			}

			// Update job status and sync status of model entity
			await this.commandBus.execute(
				new ModelEntityUpdateCommand({
					id: entityId,
					options: {
						vector: {
							hierarchies
						},
						members: statistics
					},
					job: {
						...entity.job,
						id: job.id,
						status: 'completed',
						progress: 100,
						endAt: new Date()
					}
				})
			)

			this.logger.debug(`[Job: entity '${job.id}'] End!`)
		} catch (err) {
			this.logger.debug(`[Job: entity '${job.id}'] Error!`)
			console.error(err)
			await this.entityService.update(entityId, {
				job: {
					id: job.id,
					status: 'failed',
					error: err.message,
					endAt: new Date()
				}
			})
			await job.moveToFailed(err)
		}
	}

	async checkIfJobCancelled(job: Job<TDimensionMembersSyncJob>): Promise<boolean> {
		// Check database/cache for cancellation flag
		const entity = await this.entityService.findOne(job.data.entityId)
		if (entity?.job) {
			return entity.job.status === 'cancel'
		}

		return true
	}
}
