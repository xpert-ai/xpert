import { LanguagesEnum, XpertTaskStatus } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CrudController, PaginationParams, ParseJsonPipe, RequestContext, TimeZone, TransformInterceptor } from '@metad/server-core'
import {
	BadRequestException,
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	Get,
	Logger,
	Param,
	Post,
	Put,
	Query,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { I18nLang } from 'nestjs-i18n'
import { In } from 'typeorm'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskService } from './xpert-task.service'
import { CreateXpertTaskCommand } from './commands'
import { SimpleXpertTask } from './dto/simple.dto'

@ApiTags('XpertTask')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertTaskController extends CrudController<XpertTask> {
	readonly #logger = new Logger(XpertTaskController.name)

	constructor(
		private readonly service: XpertTaskService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Post()
	async create(@Body() entity: XpertTask) {
		const task = await this.commandBus.execute(new CreateXpertTaskCommand(entity))
		return task
	}

	@Get('my')
	async getAllMy(@Query('data', ParseJsonPipe) params: PaginationParams<XpertTask>,) {
		const result = await super.findMyAll(params)
		return {
			...result,
			items: result.items.map((item) => new SimpleXpertTask(item)),
		}
	}

	@Get('total')
	async getMyTotal(@Query('data', ParseJsonPipe) params: PaginationParams<XpertTask>,) {
		const result = await super.findMyAll(params)
		return result.total
	}

	@Get('by-ids')
	async getAllByIds(@Query('ids') ids: string) {
		const _ids = ids.split(',')
		return this.service.findAll({
			where: {
				createdById: RequestContext.currentUserId(),
				id: In(_ids)
			},
			relations: ['executions', 'xpert']
		})
	}

	@UsePipes(new ValidationPipe({ whitelist: true, transform: true, skipMissingProperties: true }))
	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id')
	async update(@Param('id') id: string, @Body() entity: XpertTask) {
		try {
			return await this.service.updateTask(id, entity)
		} catch (err) {
			throw new BadRequestException(getErrorMessage(err))
		}
	}

	@UsePipes(new ValidationPipe({ whitelist: true, transform: true, skipMissingProperties: true }))
	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/schedule')
	async schedule(@Param('id') id: string, @Body() entity: XpertTask) {
		try {
			if (entity) {
				return await this.service.updateTask(id, { ...entity, status: XpertTaskStatus.SCHEDULED })
			}
			return await this.service.schedule(id)
		} catch (err) {
			throw new BadRequestException(getErrorMessage(err))
		}
	}

	@Put(':id/pause')
	async pause(@Param('id') id: string) {
		return this.service.pause(id)
	}

	@Put(':id/archive')
	async archive(@Param('id') id: string) {
		return this.service.archive(id)
	}

	@Post(':id/test')
	async test(@Param('id') id: string,
		@I18nLang() language: LanguagesEnum,
		@TimeZone() timeZone: string,
	) {
		await this.service.test(id, {
			language,
			timeZone,
		})
	}

	@Delete(':id/soft')
	async softDelete(@Param('id') id: string) {
		await this.service.pause(id)
		return this.service.softDelete(id)
	}
}
