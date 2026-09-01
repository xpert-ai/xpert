import { I18nObject, LanguagesEnum, TChatOptions } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    CrudController,
    PaginationParams,
    ParseJsonPipe,
    RequestContext,
    TimeZone,
    TransformInterceptor,
    UUIDValidationPipe,
    transformWhere
} from '@xpert-ai/server-core'
import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
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
import { FindManyOptions, FindOptionsWhere, In } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskService } from './xpert-task.service'
import { CreateXpertTaskCommand } from './commands'
import { SimpleXpertTask } from './dto/simple.dto'
import { createXpertTaskRunAsProposalValidationPipe, XpertTaskRunAsProposalDTO } from './dto/run-as.dto'

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

    @Get('count')
    async getCount(@Query() options?: FindOptionsWhere<XpertTask>) {
        return (await this.service.findHttpAccessible({ where: options })).total
    }

    @Get('pagination')
    pagination(
        @Query('data', ParseJsonPipe) filter?: PaginationParams<XpertTask>,
        @Query('$where', ParseJsonPipe) where?: HttpTaskWhere,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<XpertTask>['relations'],
        @Query('$order', ParseJsonPipe) order?: PaginationParams<XpertTask>['order'],
        @Query('$take') take?: PaginationParams<XpertTask>['take'],
        @Query('$skip') skip?: PaginationParams<XpertTask>['skip'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<XpertTask>['select']
    ) {
        return this.service.findHttpAccessible(
            buildHttpTaskFindOptions(filter, { where, relations, order, take, skip, select })
        )
    }

    @Get()
    findAll(
        @Query('data', ParseJsonPipe) filter?: PaginationParams<XpertTask>,
        @Query('$where', ParseJsonPipe) where?: HttpTaskWhere,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<XpertTask>['relations'],
        @Query('$order', ParseJsonPipe) order?: PaginationParams<XpertTask>['order'],
        @Query('$take') take?: PaginationParams<XpertTask>['take'],
        @Query('$skip') skip?: PaginationParams<XpertTask>['skip'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<XpertTask>['select']
    ) {
        return this.service.findHttpAccessible(
            buildHttpTaskFindOptions(filter, { where, relations, order, take, skip, select })
        )
    }

    @Post()
    async create(@Body() entity: XpertTask) {
        const task = await this.commandBus.execute(new CreateXpertTaskCommand(entity))
        return task
    }

    @Get('my')
    async findMyAll(@Query('data', ParseJsonPipe) params: PaginationParams<XpertTask>) {
        const result = await this.service.findHttpAccessible(params, { createdById: RequestContext.currentUserId() })
        return {
            ...result,
            items: result.items.map((item) => new SimpleXpertTask(item))
        }
    }

    @Get('total')
    async getMyTotal(@Query('data', ParseJsonPipe) params: PaginationParams<XpertTask>) {
        const result = await this.service.findHttpAccessible(params, { createdById: RequestContext.currentUserId() })
        return result.total
    }

    @Get('by-ids')
    async getAllByIds(@Query('ids') ids: string) {
        const _ids = ids.split(',')
        return this.service.findHttpAccessible(
            {
                where: { id: In(_ids) },
                relations: ['executions', 'xpert']
            },
            { createdById: RequestContext.currentUserId() }
        )
    }

    @Get('schedule/capabilities/:xpertId')
    async getScheduleCapabilities(@Param('xpertId') xpertId: string, @Query('agentKey') agentKey?: string) {
        return this.service.getScheduleCapabilities(xpertId, agentKey)
    }

    @Get('templates')
    async listXpertTaskTemplates(@Query('source') source?: string) {
        return this.service.listXpertTaskTemplates(source)
    }

    @Post('templates')
    async createXpertTaskTemplate(
        @Query('source') source: string | undefined,
        @Body()
        body: {
            key?: string
            title?: string
            prompt?: string | I18nObject
            defaultOptions?: XpertTask['options'] | null
            icon?: string | null
            source?: string | null
            builtin?: boolean
        }
    ) {
        return this.service.createXpertTaskTemplate({ ...body, source: body.source ?? source })
    }

    @Put('templates/:id')
    async updateXpertTaskTemplate(
        @Param('id') id: string,
        @Query('source') source: string | undefined,
        @Body()
        body: {
            key?: string
            title?: string
            prompt?: string | I18nObject
            defaultOptions?: XpertTask['options'] | null
            icon?: string | null
        }
    ) {
        return this.service.updateXpertTaskTemplate(id, body, source)
    }

    @Delete('templates/:id')
    async deleteXpertTaskTemplate(@Param('id') id: string, @Query('source') source?: string) {
        return this.service.deleteXpertTaskTemplate(id, source)
    }

    @UsePipes(new ValidationPipe({ whitelist: true, transform: true, skipMissingProperties: true }))
    @UseInterceptors(ClassSerializerInterceptor)
    @Put(':id')
    async update(@Param('id') id: string, @Body() entity: QueryDeepPartialEntity<XpertTask> & XpertTask) {
        try {
            return await this.service.updateHttpTask(id, entity)
        } catch (err) {
            throw new BadRequestException(getErrorMessage(err))
        }
    }

    @UsePipes(new ValidationPipe({ whitelist: true, transform: true, skipMissingProperties: true }))
    @UseInterceptors(ClassSerializerInterceptor)
    @Put(':id/schedule')
    async schedule(@Param('id') id: string, @Body() entity: XpertTask) {
        try {
            return await this.service.scheduleHttpTask(id, entity)
        } catch (err) {
            throw new BadRequestException(getErrorMessage(err))
        }
    }

    @Put(':id/pause')
    async pause(@Param('id') id: string) {
        return this.service.pauseHttpTask(id)
    }

    @Put(':id/archive')
    async archive(@Param('id') id: string) {
        return this.service.archiveHttpTask(id)
    }

    @Put(':id/unarchive')
    async unarchive(@Param('id') id: string) {
        return this.service.unarchiveHttpTask(id)
    }

    @Post(':id/run-as/proposal')
    @UsePipes(createXpertTaskRunAsProposalValidationPipe())
    async proposeRunAs(@Param('id', UUIDValidationPipe) id: string, @Body() body: XpertTaskRunAsProposalDTO) {
        return this.service.proposeProjectTaskRunAs(id, body.runAsUserId)
    }

    @Post(':id/run-as/accept')
    async acceptRunAs(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.acceptProjectTaskRunAs(id)
    }

    @Post(':id/test')
    async test(
        @Param('id') id: string,
        @I18nLang() language: LanguagesEnum,
        @TimeZone() timeZone: string,
        @Body() body?: Pick<TChatOptions, 'context' | 'timeZone'>
    ) {
        return await this.service.testHttpTask(id, {
            language,
            timeZone: body?.timeZone ?? timeZone,
            context: body?.context
        })
    }

    @Get('schedule/overview')
    async getScheduleOverview(@Query('from') from?: string, @Query('to') to?: string) {
        return this.service.getScheduleOverview(from, to)
    }

    @Get('schedule/day/:date')
    async getScheduleDay(@Param('date') date: string) {
        return this.service.getScheduleDay(date)
    }

    @Post('schedule/notes')
    async createScheduleNote(
        @Body()
        body: {
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
        }
    ) {
        return this.service.createScheduleNoteWithAutoTask(body)
    }

    @Put('schedule/notes/:id')
    async updateScheduleNote(
        @Param('id') id: string,
        @Body()
        body: {
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
        }
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
        }
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
        }
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
        }
    ) {
        return this.service.createAutoTaskTemplate(body)
    }

    @Delete(':id/soft')
    async softRemove(@Param('id') id: string) {
        return this.service.softDeleteHttpTask(id)
    }

    @Get(':id')
    findById(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('$relations', ParseJsonPipe) relations?: PaginationParams<XpertTask>['relations'],
        @Query('$select', ParseJsonPipe) select?: PaginationParams<XpertTask>['select']
    ) {
        return this.service.findHttpAccessibleById(id, relations, select)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.ACCEPTED)
    delete(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.deleteHttpTask(id)
    }

    @Put(':id/recover')
    @HttpCode(HttpStatus.ACCEPTED)
    softRecover(@Param('id', UUIDValidationPipe) id: string) {
        return this.service.recoverHttpTask(id)
    }
}

type HttpTaskWhere = Parameters<typeof transformWhere>[0]

function buildHttpTaskFindOptions(
    filter: PaginationParams<XpertTask> | undefined,
    explicit: {
        where?: HttpTaskWhere
        relations?: PaginationParams<XpertTask>['relations']
        order?: PaginationParams<XpertTask>['order']
        take?: PaginationParams<XpertTask>['take']
        skip?: PaginationParams<XpertTask>['skip']
        select?: PaginationParams<XpertTask>['select']
    }
): FindManyOptions<XpertTask> {
    const where = explicit.where ?? filter?.where
    return {
        ...(filter ?? {}),
        ...(where !== undefined ? { where: transformWhere<XpertTask>(where) ?? undefined } : {}),
        ...(explicit.relations !== undefined ? { relations: explicit.relations } : {}),
        ...(explicit.order !== undefined ? { order: explicit.order } : {}),
        ...(explicit.take !== undefined ? { take: explicit.take } : {}),
        ...(explicit.skip !== undefined ? { skip: explicit.skip } : {}),
        ...(explicit.select !== undefined ? { select: explicit.select } : {})
    }
}
