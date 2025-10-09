import { BusinessAreaRole, StoryStatusEnum, Visibility } from '@metad/contracts'
import {
	RequestContext,
	TenantOrganizationAwareCrudService,
} from '@metad/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
	Brackets,
	FindManyOptions,
	FindOneOptions,
	ILike,
	In,
	Repository,
	SelectQueryBuilder,
	WhereExpressionBuilder
} from 'typeorm'
import { BusinessArea, BusinessAreaMyCommand } from '../business-area'
import { StoryPublicDTO, StoryQueryDTO } from './dto'
import { Story } from './story.entity'

@Injectable()
export class StoryService extends TenantOrganizationAwareCrudService<Story> {
	constructor(
		@InjectRepository(Story)
		storyRepository: Repository<Story>,
		readonly commandBus: CommandBus
	) {
		super(storyRepository)
	}

	// 使用 StoryOneQuery 代替
	// /**
	//  * 
	//  * Find one story which I has authorization
	//  * 1. Created by me (Write)
	//  * 2. Project include me (Write)
	//  * 3. Business Area include me (Read)
	//  *
	//  * @param id
	//  * @param options
	//  * @returns
	//  */
	// public async findOne(
	// 	id: string | number | FindOneOptions<Story> | FindConditions<Story>,
	// 	options?: FindOneOptions<Story>
	// ): Promise<any> {
	// 	// Created by me (Write)
	// 	let story = await super
	// 		.findMy({ where: { id }, relations: options?.relations })
	// 		.then((result) => result.items[0])
	// 	if (story) {
	// 		return new StoryDTO(story, AccessEnum.Write)
	// 	} else {
	// 		// Project include me (Write)
	// 		story = await this.findMyOwnOne(id as string)
	// 		if (story) {
	// 			// Get the story details
	// 			story = await this.findOneByIdString(story.id, options)
	// 			return new StoryDTO(story, AccessEnum.Write)
	// 		} else {
	// 			// Business Area include me (Read)
	// 			const condition = await this.myBusinessAreaConditions({
	// 				where: { id },
	// 				relations: options?.relations,
	// 				take: 1
	// 			})
	// 			const [items, total] = await this.repository.findAndCount(condition)
	// 			if (total) {
	// 				return new StoryDTO(items[0], AccessEnum.Read)
	// 			} else {
	// 				//
	// 			}
	// 		}
	// 	}

	// 	return
	// }

	async findMyOwnOne(id: string) {
		const user = RequestContext.currentUser()
		const query = this.repository
			.createQueryBuilder('story')
			.leftJoinAndSelect('story.project', 'project')
			.leftJoinAndSelect('project.members', 'user')
			.where('story.id = :storyId', { storyId: id })
			.andWhere('user.id = :memberId', { memberId: user.id })

		return await query.getOne()
	}

	async findPublicOne(id: string, options: FindOneOptions) {
		const story = await this.repository.findOne({
			relations: options?.relations,
			where: {
				id,
				visibility: Visibility.Public
			}
		})

		if (!story) {
			throw new NotFoundException()
		}

		return new StoryPublicDTO(story)
	}

	public async search(text: string) {
		let where = null
		if (text) {
			text = `%${text}%`
			where = [
				{
					name: ILike(text)
				},
				{
					description: ILike(text)
				}
			]
		}

		const condition = await this.myBusinessAreaConditions({
			where,
			order: {
				updatedAt: 'DESC'
			},
			take: 20
		})

		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			items: items.map((item) => new StoryQueryDTO(item))
		}
	}

	public async trends(options: FindManyOptions<Story>, searchText?: string) {
		const tenantId = RequestContext.currentTenantId()
		let where: FindOneOptions['where'] = {
			tenantId,
			visibility: 'public',
			status: StoryStatusEnum.RELEASED
		}
		if (searchText) {
			where = [{
				...where,
				name: ILike(`%${searchText}%`)
			}, {
				...where,
				description: ILike(`%${searchText}%`)
			}]
		}
		return this.repository.findAndCount({
			...(options ?? {}),
			where,
			order: {
				updatedAt: 'DESC'
			},
		})
	}

	async myBusinessAreaConditions(conditions?: FindManyOptions<Story>, role?: BusinessAreaRole) {
		const user = RequestContext.currentUser()
		const areas = await this.commandBus.execute<BusinessAreaMyCommand, BusinessArea[]>(
			new BusinessAreaMyCommand(user, role)
		)

		return {
			...(<any>conditions ?? {}),
			where: (query: SelectQueryBuilder<Story>) => {
				const tenantId = RequestContext.currentTenantId()
				const organizationId = RequestContext.getOrganizationId()
				query.andWhere(
					new Brackets((qb: WhereExpressionBuilder) => {
						qb.andWhere(`"${query.alias}"."tenantId" = :tenantId`, { tenantId })
						qb.andWhere(`"${query.alias}"."organizationId" = :organizationId`, { organizationId })
					})
				)
				if (conditions?.where) {
					query.andWhere(conditions.where)
				}
				query.andWhere([
					{
						createdById: user.id
					},
					{
						businessAreaId: In(areas.map((item) => item.id))
					}
				])
			}
		}
	}

	public async countMy(conditions?: FindManyOptions<Story>) {
		const condition = await this.myBusinessAreaConditions(conditions)
		const total = await this.repository.count(condition)

		return total
	}

	async findMy(conditions?: FindManyOptions<Story>) {
		const condition = await this.myBusinessAreaConditions(conditions)
		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			items
		}
	}

	async updateModels(id: string, models: string[], relations?: string[]) {
		const story = await this.findOne(id)
		story.models = models.map((id) => ({ id }))
		await this.repository.save(story)

		return await this.findOne(id, { relations })
	}

	async deleteModel(id: string, modelId: string) {
		const story = await this.findOne(id, { relations: ['models'] })
		story.models = story.models.filter(({ id }) => id !== modelId)
		await this.repository.save(story)
	}
}
