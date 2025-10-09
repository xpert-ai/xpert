import { IPagination, ISecretToken, IStoryPoint } from '@metad/contracts'
import { CrudController, PaginationParams, ParseJsonPipe, Public, SecretTokenGetCommand, UUIDValidationPipe } from '@metad/server-core'
import {
	ClassSerializerInterceptor,
	Controller,
	ForbiddenException,
	Get,
	NotFoundException,
	Param,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FindOneOptions } from 'typeorm'
import { StoryPointPublicDTO } from './dto'
import { StoryPointOneQuery } from './queries'
import { StoryPoint } from './story-point.entity'
import { StoryPointService } from './story-point.service'

@Controller()
export class StoryPointController extends CrudController<StoryPoint> {
	constructor(
		private readonly storyPointService: StoryPointService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(storyPointService)
	}

	@Get()
	async findAll(@Query('$query', ParseJsonPipe) data: any): Promise<IPagination<StoryPoint>> {
		const { relations, findInput } = data
		return await this.storyPointService.findAll({
			where: findInput,
			relations
		})
	}

	/**
	 * Get public story point
	 *
	 * @param id
	 * @param options
	 * @returns
	 */
	@Public()
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public/:id')
	async getPublicOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) options: FindOneOptions<IStoryPoint>
	): Promise<StoryPointPublicDTO> {
		const { relations } = options
		const point = await this.storyPointService.findPublicOne(id, { relations })

		if (!point) {
			throw new NotFoundException()
		}

		return point
	}

	/**
	 * Get story point by id
	 * - If private shared token is provided
	 * - Otherwise you have permission to access the story point
	 * 
	 * @param id 
	 * @param options 
	 * @param token 
	 * @returns 
	 */
	@Get(':id')
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<StoryPoint>['relations'],
		@Query('$query', ParseJsonPipe) options: FindOneOptions<StoryPoint>,
		@Query('token') token: string
	): Promise<StoryPoint> {
		if (token) {
			const secretToken: ISecretToken = await this.commandBus.execute(new SecretTokenGetCommand({ token }))
			if (secretToken && !secretToken.expired) {
				const where = secretToken.entityId === id ? { id } : { id, storyId: secretToken.entityId }
				return await this.storyPointService.findOne({
					...(options ?? {}),
					where
				})
			} else {
				throw new ForbiddenException('The token is invalid or expired')
			}
		} else {
			return await this.queryBus.execute(new StoryPointOneQuery(id, options))
		}
	}
}
