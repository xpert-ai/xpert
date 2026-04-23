import { LanguagesEnum, ScheduleTaskStatus } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CrudController, PaginationParams, ParseJsonPipe, RequestContext, TimeZone, TransformInterceptor } from '@xpert-ai/server-core'
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
				return await this.service.updateTask(id, { ...entity, status: ScheduleTaskStatus.SCHEDULED })
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

	@Get('schedule/overview')
	async getScheduleOverview(
		@Query('from') from?: string,
		@Query('to') to?: string,
	) {
		return this.service.getScheduleOverview(from, to)
	}

	@Get('schedule/day/:date')
	async getScheduleDay(@Param('date') date: string) {
		return this.service.getScheduleDay(date)
	}

	@Post('schedule/notes')
	async createScheduleNote(
		@Body() body: {
			title: string
			content?: string | null
			date: string
			remindAt?: string | null
			type?: string
			status?: string
			autoTask?: {
				title?: string
				description?: string | null
				prompt?: string
				repo?: string
				branch?: string
				schedule?: string
				frequency?: string
				enabled?: boolean
				templateId?: string | null
				runAt?: string | null
				timeZone?: string | null
				pushChannel?: string | null
				params?: Record<string, unknown> | null
			} | null
		},
	) {
		return this.service.createScheduleNoteWithAutoTask(body)
	}

	@Put('schedule/notes/:id')
	async updateScheduleNote(
		@Param('id') id: string,
		@Body() body: {
			title?: string
			content?: string | null
			date?: string
			remindAt?: string | null
			type?: string
			status?: string
			autoTask?: {
				title?: string
				description?: string | null
				prompt?: string
				repo?: string
				branch?: string
				schedule?: string
				frequency?: string
				enabled?: boolean
				templateId?: string | null
				runAt?: string | null
				timeZone?: string | null
				pushChannel?: string | null
				params?: Record<string, unknown> | null
			} | null
		},
	) {
		return this.service.updateScheduleNote(id, body)
	}

	@Delete('schedule/notes/:id')
	async deleteScheduleNote(@Param('id') id: string) {
		return this.service.deleteScheduleNote(id)
	}

	@Get('auto-tasks')
	async listAutoTasks() {
		return this.service.listAutoTasks()
	}

	@Post('auto-tasks')
	async createAutoTask(
		@Body()
		body: {
			title?: string
			description?: string | null
			prompt?: string
			repo?: string
			branch?: string
			schedule?: string
			frequency?: string
			enabled?: boolean
			templateId?: string | null
			runAt?: string | null
			timeZone?: string | null
			pushChannel?: string | null
			params?: Record<string, unknown> | null
		},
	) {
		return this.service.createAutoTask(body)
	}

	@Put('auto-tasks/:id')
	async updateAutoTask(
		@Param('id') id: string,
		@Body()
		body: {
			title?: string
			description?: string | null
			prompt?: string
			repo?: string
			branch?: string
			schedule?: string
			frequency?: string
			enabled?: boolean
			templateId?: string | null
			runAt?: string | null
			timeZone?: string | null
			pushChannel?: string | null
			params?: Record<string, unknown> | null
		},
	) {
		return this.service.updateAutoTask(id, body)
	}

	@Delete('auto-tasks/:id')
	async deleteAutoTask(@Param('id') id: string) {
		return this.service.deleteAutoTask(id)
	}

	@Get('auto-task-templates')
	async listAutoTaskTemplates() {
		return this.service.listAutoTaskTemplates()
	}

	@Post('auto-task-templates')
	async createAutoTaskTemplate(
		@Body()
		body: {
			key?: string
			title?: string
			description?: string | null
			prompt?: string
			defaultParams?: Record<string, unknown> | null
			icon?: string | null
		},
	) {
		return this.service.createAutoTaskTemplate(body)
	}

	@Delete(':id/soft')
	async softDelete(@Param('id') id: string) {
		await this.service.pause(id)
		return this.service.softDelete(id)
	}
}
