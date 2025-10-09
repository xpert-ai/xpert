import {
	AccessEnum,
	BusinessType,
	IPagination,
	ISecretToken,
	IStory,
	StoryStatusEnum,
	VisitEntityEnum,
	VisitTypeEnum
} from '@metad/contracts'
import {
	CrudController,
	CurrentUser,
	PaginationParams,
	ParseJsonPipe,
	Public,
	RequestContext,
	SecretTokenCreateCommand,
	SecretTokenGetCommand,
	UUIDValidationPipe,
	User
} from '@metad/server-core'
import {
	BadRequestException,
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { add } from 'date-fns'
import { nanoid } from 'nanoid'
import { FindOptionsWhere, FindManyOptions, FindOneOptions, IsNull, ObjectLiteral } from 'typeorm'
import { CaslAbilityFactory } from '../core/index'
import { BookmarkGetCommand } from '../favorite'
import { ProjectGetQuery } from '../project'
import { VisitCreateCommand } from '../visit/commands'
import { StoryCopyCommand, StoryImportCommand } from './commands'
import { StoryDTO, StoryPublicDTO } from './dto'
import { StoryOneQuery, StoryTrendsQuery } from './queries'
import { Story } from './story.entity'
import { StoryService } from './story.service'

@ApiTags('Story')
@ApiBearerAuth()
@Controller()
export class StoryController extends CrudController<Story> {
	constructor(
		private readonly storyService: StoryService,
		private readonly caslAbilityFactory: CaslAbilityFactory,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(storyService)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get()
	async findAllStory(
		@Query('$query', ParseJsonPipe) data: FindManyOptions,
		@Query('project') projectId: string,
		@CurrentUser() user: User
	): Promise<IPagination<Story>> {
		const { relations, order, take } = data
		let { where } = data
		where = where ?? {}
		if (projectId === 'null' || projectId === 'undefined' || !projectId) {
			where = {
				...(<FindOptionsWhere<Story>>where),
				projectId: IsNull(),
				createdById: user.id
			}
		} else {
			const project = await this.queryBus.execute(new ProjectGetQuery({ id: projectId }))
			if (!project) {
				throw new NotFoundException(`Not found the project '${projectId}'`)
			}

			where = {
				...(<FindOptionsWhere<Story>>where),
				projectId
			}
		}

		return this.storyService.findAll({
			where,
			relations,
			order,
			take
		})
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('catalog')
	async findAllByCatalog(@Query('$query', ParseJsonPipe) data: FindManyOptions): Promise<IPagination<Story>> {
		const { where, relations, order, take } = data

		return this.storyService.findMy({
			where: {
				...(<ObjectLiteral>where ?? {}),
				status: StoryStatusEnum.RELEASED
			},
			relations,
			order,
			take
		})
	}

	@Get('count')
	async getCount(): Promise<number | void> {
		return await this.storyService.countMy()
	}

	@Public()
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public/trends')
	async trends(
		@Query('take') take: number,
		@Query('skip') skip: number,
		@Query('orderType') orderType: 'visits' | 'update',
		@Query('relations') relations: string[],
		@Query('searchText') searchText?: string
	) {
		const { items, total } = await this.queryBus.execute(
			new StoryTrendsQuery(searchText, { take, skip, relations }, orderType)
		)
		return {
			total,
			items: items.map((item) => new StoryPublicDTO(item))
		}
	}

	@Public()
	@UseInterceptors(ClassSerializerInterceptor)
	@Get('public/:id')
	async publicOne(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) data: any
	): Promise<StoryPublicDTO> {
		const { relations } = data
		const story = await this.storyService.findPublicOne(id, {
			relations
		})

		this.commandBus.execute(
			new VisitCreateCommand({
				type: VisitTypeEnum.View,
				entity: VisitEntityEnum.Story,
				entityId: story.id,
				entityName: story.name,
				businessAreaId: story.businessAreaId
			})
		)

		return story
	}

	/**
	 * 使用 ClassSerializerInterceptor 和 DataSource options 上 @Exclude() 排除了 options 的返回.
	 * 需要返回 options 的 api 地方不使用 ClassSerializerInterceptor;
	 *
	 * 后续改成 DTO 不同的 class 的方式来排除 options
	 */
	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id')
	async findOneById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$relations', ParseJsonPipe) relations: PaginationParams<Story>['relations'],
		@Query('$query', ParseJsonPipe) options: FindOneOptions<Story>,
		@Query('token') token: string
	): Promise<Story> {
		let story: Story
		if (token) {
			const secretToken: ISecretToken = await this.commandBus.execute(new SecretTokenGetCommand({ token }))
			if (secretToken && !secretToken.expired && secretToken.entityId === id) {
				story = await this.storyService.findOne(id, {relations, ...options})
			} else {
				throw new ForbiddenException('The token is invalid or expired')
			}
		} else {
			story = await this.queryBus.execute(new StoryOneQuery(id, {relations, ...options}))
		}

		const dto = new StoryDTO(story, accessOfStory(story))

		const bookmarks = await this.commandBus.execute(
			new BookmarkGetCommand({
				type: BusinessType.STORY,
				entity: story.id,
				project: story.projectId
			})
		)
		dto.bookmark = bookmarks[0]
		this.commandBus.execute(
			new VisitCreateCommand({
				type: VisitTypeEnum.View,
				entity: VisitEntityEnum.Story,
				entityId: story.id,
				entityName: story.name,
				businessAreaId: story.businessAreaId
			})
		)

		return dto as Story
	}

	@Post('import')
	async import(@Body() story: Partial<IStory>): Promise<Story> {
		try {
			return await this.commandBus.execute(new StoryImportCommand(story))
		} catch (err) {
			throw new BadRequestException(err.message)
		}
	}

	@Post(':id/copy')
	async copy(@Param('id', UUIDValidationPipe) id: string, @Body() story: Partial<IStory>): Promise<Story> {
		const _story = await this.storyService.findOne(id)
		if (!_story) {
			throw new NotFoundException()
		}
		return await this.commandBus.execute(
			new StoryCopyCommand({
				...(story ?? {}),
				id
			})
		)
	}

	@Post(':id/share/token')
	async shareToken(@Param('id', UUIDValidationPipe) id: string, @Body() body: { validUntil: any }): Promise<string> {
		// Check if the user has the permission to share the story
		// todo

		const token: ISecretToken = await this.commandBus.execute(
			new SecretTokenCreateCommand({
				entityId: id,
				token: nanoid(),
				validUntil: add(new Date(), body.validUntil)
			})
		)
		return token.token
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/models')
	async updateModels(@Param('id') id: string, @Body() models: string[], @Query('relations') relations: string) {
		const project = await this.storyService.updateModels(id, models, relations?.split(','))
		return new StoryPublicDTO(project)
	}

	@Delete(':id/models/:modelId')
	async deleteModel(@Param('id') id: string, @Param('modelId') modelId: string) {
		await this.storyService.deleteModel(id, modelId)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id/access')
	async accessById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('$query', ParseJsonPipe) options: FindOneOptions<Story>
	): Promise<{ access: AccessEnum }> {
		const story = await this.queryBus.execute(new StoryOneQuery(id, options))
		return { access: accessOfStory(story) }
	}
}

function accessOfStory(story: IStory) {
	const me = RequestContext.currentUser()

	if (story.createdById === me.id || story.project?.members?.find((member) => member.id === me.id)) {
		return AccessEnum.Write
	} else {
		return AccessEnum.Read
	}
}
