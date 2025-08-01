import { embeddingCubeCollectionName } from '@metad/contracts'
import { estimateTokenUsage } from '@metad/copilot'
import { runWithRequestContext, UserService } from '@metad/server-core'
import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Job } from 'bull'
import { GetDimensionMembersCommand } from '../model-member/commands'
import { CreateVectorStoreCommand } from '../model-member/commands/'
import { SemanticModelMemberService } from '../model-member/member.service'
import { SemanticModelService } from '../model/model.service'
import { ModelEntityUpdateCommand } from './commands'
import { SemanticModelEntityService } from './entity.service'
import { JOB_ENTITY_SYNC, MEMBERS_SYNC_NAME, TDimensionMembersSyncJob } from './types'

const batchSize = 50

@Processor(JOB_ENTITY_SYNC)
export class EntityMemberProcessor {
	private readonly logger = new Logger(EntityMemberProcessor.name)

	constructor(
		private readonly entityService: SemanticModelEntityService,
		private readonly memberService: SemanticModelMemberService,
		private readonly modelService: SemanticModelService,
		private readonly userService: UserService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Process(MEMBERS_SYNC_NAME)
	async handleSyncMembers(job: Job<TDimensionMembersSyncJob>) {
		const { tenantId, organizationId, createdById, modelId, entityId, cube, dimensions } = job.data
		const user = await this.userService.findOne(createdById, { relations: ['role'] })

		this.logger.debug(
			`[Job: entity '${job.id}'] Start sync dimension memebrs for model '${modelId}' and cube '${cube}' ...`
		)

		runWithRequestContext({ user: user, headers: { ['organization-id']: organizationId } }, async () => {
			try {
				const entity = await this.entityService.findOne(entityId)
				const model = await this.modelService.findOne(modelId, {
					where: { tenantId, organizationId },
					relations: ['dataSource', 'dataSource.type', 'roles']
				})
				const { entityType, members, statistics } = await this.commandBus.execute(
					new GetDimensionMembersCommand(model, cube, dimensions, entityId)
				)

				const collectionName = embeddingCubeCollectionName(model.id, cube, false)
				const vectorStore = await this.commandBus.execute(new CreateVectorStoreCommand(collectionName))
				// Clear all dimensions
				await vectorStore?.clear()
				// Remove previous members
				try {
					await this.memberService.bulkDelete(model.id, cube, {})
				} catch (err) {
					//
				}

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
						await Promise.all(
							entities.map((entity) => this.memberService.update(entity.id, { vector: true }))
						)
					}

					count++
					const progress =
						batchSize * count >= members.length
							? 100
							: (((batchSize * count) / members.length) * 100).toFixed(1)
					this.logger.debug(`Embeddings members for dimensions '${dimensions}' progress: ${progress}%`)

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
								dimensions
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

				await this.modelService.updateModelOptions(modelId, (options) => {
					return {
						...(options ?? {}),
						embedded: {
							...(options.embedded ?? {}),
							[cube]: {
								...(options.embedded?.[cube] ?? {}),
								...dimensions.reduce((acc, dimension) => {
									acc[dimension] = true
									return acc
								}, {})
							}
						}
					}
				})
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
		})
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
