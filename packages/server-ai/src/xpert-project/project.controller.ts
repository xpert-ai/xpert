import {
    AIPermissionsEnum,
    IKnowledgebase,
    IPagination,
    IXpertProject,
    IXpertProjectAsset,
    IXpertProjectAutomation,
    IXpertProjectCreateInput,
    IXpertProjectMilestone,
    IXpertProjectPlan,
    IXpertProjectTask,
    IXpertProjectTaskConversation,
    IXpertProjectTaskExecution,
    IXpertProjectSprint,
    IXpertProjectSwimlane,
    IXpertToolset,
    OrderTypeEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    CrudController,
    PaginationParams,
    ParseJsonPipe,
    TransformInterceptor,
    UploadFileCommand,
    getFileAssetDestination,
    UserPublicDTO
} from '@xpert-ai/server-core'
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    Logger,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindOneOptions } from 'typeorm'
import { ChatConversationPublicDTO } from '../chat-conversation/dto'
import { FindChatConversationQuery } from '../chat-conversation/queries'
import { XpertProjectDto, XpertProjectTaskDto } from './dto'
import { XpertProject } from './entities/project.entity'
import { XpertProjectTask } from './entities/project-task.entity'
import { ProjectPermission, XpertProjectFeatureGuard, XpertProjectGuard, XpertProjectPermissionGuard } from './guards'
import { XpertProjectService } from './project.service'
import { VOLUME_CLIENT, VolumeClient } from '../shared'
import {
    XpertProjectActivityService,
    XpertProjectAssetService,
    XpertProjectAutomationService,
    XpertProjectPlanService
} from './services'

@ApiTags('XpertProject')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@UseGuards(XpertProjectFeatureGuard, XpertProjectPermissionGuard)
@ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
@Controller()
export class XpertProjectController extends CrudController<XpertProject> {
    readonly #logger = new Logger(XpertProjectController.name)
    constructor(
        private readonly service: XpertProjectService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly planService: XpertProjectPlanService,
        private readonly activityService: XpertProjectActivityService,
        private readonly assetService: XpertProjectAssetService,
        private readonly automationService: XpertProjectAutomationService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {
        super(service)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE)
    @Post('import')
    async importDsl(@Body() input: unknown) {
        return new XpertProjectDto(await this.service.importProject(input))
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @Get('overview')
    async overview(@Query('projectId') projectId?: string) {
        const id = projectId?.trim()
        if (!id) return this.service.findAllMy({ take: 25, skip: 0, order: {}, where: {}, withDeleted: false })
        await this.service.assertProjectAccess(id)
        const [plans, tasks, assets, assetTotal, activities, automations] = await Promise.all([
            this.planService.list(id),
            this.service.getTasks(id, { take: 100, skip: 0, order: {}, where: {}, withDeleted: false }),
            this.assetService.list(id, undefined, undefined, { take: 100, skip: 0 }),
            this.assetService.countProjectAssets(id),
            this.activityService.list(id, 20),
            this.automationService.list(id, { includeRuns: false })
        ])
        return {
            project: await this.service.findOne(id, {
                relations: ['owner', 'members', 'workspace', 'xperts', 'toolsets', 'knowledges']
            }),
            plans,
            tasks,
            assets,
            assetTotal,
            activities,
            automations
        }
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE)
    @HttpCode(HttpStatus.CREATED)
    @Post()
    async create(@Body() entity: IXpertProjectCreateInput): Promise<XpertProject> {
        const { xpertIds, toolsetIds, knowledgebaseIds, memberIds, ...projectInput } = entity
        const project = await this.service.create({
            ...projectInput,
            status: projectInput.status ?? 'active',
            settings: {
                instruction: projectInput.settings?.instruction ?? '',
                ...projectInput.settings,
                managementMode: projectInput.settings?.managementMode ?? 'simple'
            }
        })

        // Resource selections are part of the create contract so the wizard
        // can complete project setup in one request. Each helper is
        // idempotent and applies the current tenant/organization query scope.
        for (const xpertId of xpertIds ?? []) await this.service.addXpert(project.id, xpertId)
        for (const toolsetId of toolsetIds ?? []) await this.service.addToolset(project.id, toolsetId)
        for (const knowledgebaseId of knowledgebaseIds ?? [])
            await this.service.addKnowledge(project.id, knowledgebaseId)
        if (memberIds?.length) await this.service.updateMembers(project.id, memberIds)

        await this.planService.ensureDefaults(project.id)
        await this.activityService.record(project.id, {
            type: 'project.created',
            summary: `Project ${project.name} created`,
            entityType: 'project',
            entityId: project.id,
            payload: {
                xpertCount: xpertIds?.length ?? 0,
                toolsetCount: toolsetIds?.length ?? 0,
                knowledgebaseCount: knowledgebaseIds?.length ?? 0,
                memberCount: memberIds?.length ?? 0
            }
        })
        return this.service.findOne(project.id, {
            relations: ['owner', 'members', 'workspace', 'xperts', 'toolsets', 'knowledges', 'copilotModel']
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @Get('')
    async findAll(
        @Query('data', ParseJsonPipe) params: PaginationParams<XpertProject>
    ): Promise<IPagination<XpertProject>> {
        return this.service.findAllMy(params)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/workspace')
    async bindWorkspace(@Param('id') id: string, @Body() input: { workspaceId?: string }) {
        const workspaceId = input?.workspaceId?.trim()
        if (!workspaceId) throw new BadRequestException('Project Workspace is required')

        const project = await this.service.update(id, { workspaceId })
        await this.activityService.record(id, {
            type: 'project.workspace_bound',
            summary: 'Project Workspace binding updated',
            entityType: 'project',
            entityId: id,
            payload: { workspaceId }
        })
        return new XpertProjectDto(await this.service.findOne(project.id, { relations: ['workspace'] }))
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id')
    async update(@Param('id') id: string, @Body() entity: Partial<XpertProject>) {
        const project = await this.service.update(id, entity)
        await this.activityService.record(id, {
            type: 'project.updated',
            summary: 'Project configuration updated',
            entityType: 'project',
            entityId: id
        })
        return new XpertProjectDto(project)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.service.delete(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Delete(':id/soft')
    async softRemove(@Param('id') id: string) {
        return this.service.softRemove(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/recover')
    async recover(@Param('id') id: string) {
        return this.service.softRecover(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/archive')
    async archive(@Param('id') id: string) {
        const project = await this.service.archive(id)
        await this.activityService.record(id, {
            type: 'project.archived',
            summary: `Project ${project.name} archived`,
            entityType: 'project',
            entityId: id
        })
        return new XpertProjectDto(project)
    }

    @ApiOperation({ summary: 'find my all' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Found my records'
    })
    @Get('my')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async findAllMyProjects(
        @Query('data', ParseJsonPipe) params: PaginationParams<XpertProject>
    ): Promise<IPagination<XpertProject>> {
        return this.service.findAllMy(params)
    }

    @Get(':id')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    async getXpertProject(@Param('id') id: string, @Query('data', ParseJsonPipe) params: FindOneOptions<XpertProject>) {
        const project = await this.service.findOne(id, params)
        return new XpertProjectDto(project)
    }

    @Post(':id/duplicate')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE)
    @UseGuards(XpertProjectGuard)
    async duplicateProject(@Param('id') id: string) {
        const project = await this.service.duplicate(id)
        return new XpertProjectDto(project)
    }

    @UseGuards(XpertProjectGuard)
    @Get(':id/export')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async exportDsl(@Param('id') id: string) {
        return {
            data: await this.service.exportProject(id)
        }
    }

    @Get(':id/xperts')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    async getXperts(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertProject>) {
        return this.service.getXperts(id, params)
    }

    @Put(':id/xperts/:xpert')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async updateXperts(@Param('id') id: string, @Param('xpert') xpertId: string) {
        return this.service.addXpert(id, xpertId)
    }

    @Delete(':id/xperts/:xpert')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async removeXpert(@Param('id') id: string, @Param('xpert') xpertId: string) {
        return this.service.removeXpert(id, xpertId)
    }

    @Get(':id/conversations')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    async getConversations(@Param('id') id: string) {
        const { items, total } = await this.queryBus.execute(
            new FindChatConversationQuery(
                { projectId: id },
                { relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } }
            )
        )
        return {
            items: items.map((_) => new ChatConversationPublicDTO(_)),
            total
        }
    }

    @Get(':id/toolsets')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    async getToolsets(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<IXpertToolset>) {
        return this.service.getToolsets(id, params)
    }

    @Put(':id/toolsets/:toolset')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async updateToolsets(@Param('id') id: string, @Param('toolset') toolsetId: string) {
        await this.service.addToolset(id, toolsetId)
    }

    @Delete(':id/toolsets/:toolset')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async removeToolset(@Param('id') id: string, @Param('toolset') toolsetId: string) {
        await this.service.removeToolset(id, toolsetId)
    }

    @Get(':id/knowledges')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    async getKnowledges(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) params: PaginationParams<IKnowledgebase>
    ) {
        return this.service.getKnowledges(id, params)
    }

    @Put(':id/knowledges/:kb')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async updateKnowledges(@Param('id') id: string, @Param('kb') kbId: string) {
        await this.service.addKnowledge(id, kbId)
    }

    @Delete(':id/knowledges/:kb')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    async removeKnowledge(@Param('id') id: string, @Param('kb') kbId: string) {
        await this.service.removeKnowledgebase(id, kbId)
    }

    @UseGuards(XpertProjectGuard)
    @Get(':id/members')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async getMembers(@Param('id') id: string) {
        const project = await this.service.findOne(id, { relations: ['members'] })
        return project.members.map((_) => new UserPublicDTO(_))
    }

    @UseGuards(XpertProjectGuard)
    @Put(':id/members')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    async updateMembers(@Param('id') id: string, @Body() members: string[]) {
        await this.service.updateMembers(id, members)
    }

    @UseGuards(XpertProjectGuard)
    @Get(':id/tasks')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async getTasks(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<XpertProjectTask>) {
        const { items } = await this.service.getTasks(id, params)
        return items.map((_) => new XpertProjectTaskDto(_))
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/tasks')
    async createTask(@Param('id') id: string, @Body() task: Partial<IXpertProjectTask>) {
        const created = await this.service.createTasks(id, task)
        await this.activityService.record(id, {
            type: 'task.created',
            summary: `Task ${created.title || created.name} created`,
            entityType: 'task',
            entityId: created.id
        })
        return new XpertProjectTaskDto(created)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/tasks/:taskId')
    async getTask(@Param('id') id: string, @Param('taskId') taskId: string) {
        const task = await this.service.getTasks(id, {
            take: 1,
            skip: 0,
            order: {},
            where: { id: taskId },
            relations: ['steps', 'conversations', 'executions'],
            withDeleted: false
        })
        if (!task.items[0]) throw new NotFoundException('Project task not found')
        return new XpertProjectTaskDto(task.items[0])
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/tasks/:taskId/relations')
    async getTaskRelations(@Param('id') id: string, @Param('taskId') taskId: string) {
        return this.service.getTaskRelations(id, taskId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/tasks/order')
    async reorderTasks(@Param('id') id: string, @Body() input: Array<{ id: string; order: number; column?: string }>) {
        const tasks = await this.service.reorderTasks(id, input ?? [])
        await this.activityService.record(id, {
            type: 'task.reordered',
            summary: `${tasks.length} tasks reordered`,
            entityType: 'task',
            payload: { count: tasks.length }
        })
        return tasks.map((task) => new XpertProjectTaskDto(task))
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/tasks/batch')
    async batchUpdateTasks(
        @Param('id') id: string,
        @Body()
        input: {
            ids: string[]
            status?: IXpertProjectTask['status']
            assigneeId?: string
            priority?: IXpertProjectTask['priority']
        }
    ) {
        const tasks = await this.service.batchUpdateTasks(id, input)
        await this.activityService.record(id, {
            type: 'task.batch_updated',
            summary: `${tasks.length} tasks updated`,
            entityType: 'task',
            payload: { count: tasks.length, ...(input.status ? { status: input.status } : {}) }
        })
        return tasks
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/tasks/:taskId')
    async updateTask(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body() task: Partial<IXpertProjectTask>
    ) {
        const updated = await this.service.updateTask(id, taskId, task)
        await this.activityService.record(id, {
            type: 'task.updated',
            summary: `Task ${updated.title || updated.name} updated`,
            entityType: 'task',
            entityId: taskId,
            payload: task.status ? { status: task.status } : undefined
        })
        if (task.status) await this.automationService.triggerEvent(id, 'task.status_changed', taskId)
        return new XpertProjectTaskDto(updated)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/tasks/:taskId/conversations')
    linkTaskConversation(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body()
        input: Pick<IXpertProjectTaskConversation, 'conversationId' | 'relationType'> &
            Partial<IXpertProjectTaskConversation>
    ) {
        return this.service.linkTaskConversation(id, taskId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/tasks/:taskId/executions')
    createTaskExecution(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body() input: Partial<IXpertProjectTaskExecution>
    ) {
        return this.service.createTaskExecution(id, taskId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/tasks/:taskId/executions/:executionId')
    updateTaskExecution(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Param('executionId') executionId: string,
        @Body() input: Partial<IXpertProjectTaskExecution>
    ) {
        return this.service.updateTaskExecution(id, taskId, executionId, input)
    }

    // Plans and milestones
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/plans')
    listPlans(@Param('id') id: string) {
        return this.planService.list(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans')
    createPlan(@Param('id') id: string, @Body() input: Partial<IXpertProjectPlan>) {
        return this.planService.createPlan(id, input).then((plan) => {
            void this.activityService.record(id, {
                type: 'plan.created',
                summary: `Plan ${plan.name} created`,
                entityType: 'plan',
                entityId: plan.id
            })
            return plan
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/plans/:planId')
    async updatePlan(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Body() input: Partial<IXpertProjectPlan>
    ) {
        const plan = await this.planService.updatePlan(id, planId, input)
        await this.activityService.record(id, {
            type: 'plan.updated',
            summary: `Plan ${plan.name} updated`,
            entityType: 'plan',
            entityId: plan.id
        })
        return plan
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Delete(':id/plans/:planId')
    removePlan(@Param('id') id: string, @Param('planId') planId: string) {
        return this.planService.removePlan(id, planId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans/:planId/milestones')
    createMilestone(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Body() input: Partial<IXpertProjectMilestone>
    ) {
        return this.planService.createMilestone(id, planId, input).then((milestone) => {
            void this.activityService.record(id, {
                type: 'milestone.created',
                summary: `Milestone ${milestone.name} created`,
                entityType: 'milestone',
                entityId: milestone.id
            })
            return milestone
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/plans/:planId/milestones/:milestoneId')
    updateMilestone(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Param('milestoneId') milestoneId: string,
        @Body() input: Partial<IXpertProjectMilestone>
    ) {
        return this.planService.updateMilestone(id, planId, milestoneId, input).then((milestone) => {
            void this.activityService.record(id, {
                type: 'milestone.updated',
                summary: `Milestone ${milestone.name} updated`,
                entityType: 'milestone',
                entityId: milestone.id
            })
            return milestone
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Delete(':id/plans/:planId/milestones/:milestoneId')
    removeMilestone(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Param('milestoneId') milestoneId: string
    ) {
        return this.planService.removeMilestone(id, planId, milestoneId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/plans/:planId/sprints')
    listSprints(@Param('id') id: string, @Param('planId') planId: string) {
        return this.planService.listSprints(id, planId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans/:planId/sprints')
    createSprint(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Body() input: Partial<IXpertProjectSprint>
    ) {
        return this.planService.createSprint(id, planId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/sprints/:sprintId')
    updateSprint(
        @Param('id') id: string,
        @Param('sprintId') sprintId: string,
        @Body() input: Partial<IXpertProjectSprint>
    ) {
        return this.planService.updateSprint(id, sprintId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/sprints/:sprintId/swimlanes')
    listSwimlanes(@Param('id') id: string, @Param('sprintId') sprintId: string) {
        return this.planService.listSwimlanes(id, sprintId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/sprints/:sprintId/swimlanes')
    createSwimlane(
        @Param('id') id: string,
        @Param('sprintId') sprintId: string,
        @Body() input: Partial<IXpertProjectSwimlane>
    ) {
        return this.planService.createSwimlane(id, sprintId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/sprints/:sprintId/swimlanes/:swimlaneId')
    updateSwimlane(
        @Param('id') id: string,
        @Param('sprintId') sprintId: string,
        @Param('swimlaneId') swimlaneId: string,
        @Body() input: Partial<IXpertProjectSwimlane>
    ) {
        return this.planService.updateSwimlane(id, sprintId, swimlaneId, input)
    }

    // Activities
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/activities')
    listActivities(@Param('id') id: string, @Query('take') take?: number) {
        return this.activityService.list(id, take)
    }

    // Assets
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/assets')
    listAssets(
        @Param('id') id: string,
        @Query('parentId') parentId?: string,
        @Query('kind') kind?: IXpertProjectAsset['kind'],
        @Query('skip') skip?: string,
        @Query('take') take?: string
    ) {
        return this.assetService.list(id, parentId, kind, {
            skip: Math.max(Number(skip) || 0, 0),
            take: Math.min(Math.max(Number(take) || 100, 1), 200)
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/assets/tree')
    assetTree(@Param('id') id: string) {
        return this.assetService.tree(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/assets')
    createAsset(@Param('id') id: string, @Body() input: Partial<IXpertProjectAsset>) {
        return this.assetService.createAsset(id, input).then((asset) => {
            void this.activityService.record(id, {
                type: 'asset.created',
                summary: `Asset ${asset.name} added`,
                entityType: 'asset',
                entityId: asset.id
            })
            void this.automationService.triggerEvent(id, 'asset.created', asset.id)
            return asset
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/assets/:assetId')
    updateAsset(
        @Param('id') id: string,
        @Param('assetId') assetId: string,
        @Body() input: Partial<IXpertProjectAsset>
    ) {
        return this.assetService.updateAsset(id, assetId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Delete(':id/assets/:assetId')
    removeAsset(@Param('id') id: string, @Param('assetId') assetId: string) {
        return this.assetService.removeAsset(id, assetId)
    }

    // Automations
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Get(':id/automations')
    listAutomations(@Param('id') id: string) {
        return this.automationService.list(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/automations')
    createAutomation(@Param('id') id: string, @Body() input: Partial<IXpertProjectAutomation>) {
        return this.automationService.createAutomation(id, input).then((automation) => {
            void this.activityService.record(id, {
                type: 'automation.created',
                summary: `Automation ${automation.name} created`,
                entityType: 'automation',
                entityId: automation.id
            })
            return automation
        })
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/automations/:automationId')
    updateAutomation(
        @Param('id') id: string,
        @Param('automationId') automationId: string,
        @Body() input: Partial<IXpertProjectAutomation>
    ) {
        return this.automationService.updateAutomation(id, automationId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Delete(':id/automations/:automationId')
    removeAutomation(@Param('id') id: string, @Param('automationId') automationId: string) {
        return this.automationService.removeAutomation(id, automationId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/automations/:automationId/run')
    runAutomation(
        @Param('id') id: string,
        @Param('automationId') automationId: string,
        @Body() input: { occurrenceKey?: string }
    ) {
        return this.automationService.run(id, automationId, input?.occurrenceKey)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Get(':id/automations/runs')
    listAutomationRuns(@Param('id') id: string, @Query('automationId') automationId?: string) {
        return this.automationService.listRuns(id, automationId)
    }

    // Files
    /**
     * List files in volume of project
     *
     * @param id Project
     * @param deepth Deepth of the directory structure to list
     * @param path Path to list files from
     * @returns
     */
    @UseGuards(XpertProjectGuard)
    @Get(':id/files')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async readFiles(@Param('id') id: string, @Query('deepth') deepth: number, @Query('path') path: string) {
        const project = await this.service.findOne(id, { relations: ['createdBy'] })
        const client = await this.volumeClient
            .resolve({
                tenantId: project.tenantId,
                userId: project.ownerId,
                catalog: 'projects',
                projectId: project.id
            })
            .ensureRoot()

        return await client.list({ path, deepth })
    }

    /**
     * Upload a file to the project volume.
     *
     * @param id
     * @param file
     * @returns
     */
    @Post(':id/file/upload')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('A project file is required')
        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'multipart',
                    file
                },
                targets: [
                    {
                        kind: 'volume',
                        catalog: 'projects',
                        projectId: id
                    }
                ]
            })
        )
        const destination = getFileAssetDestination(asset, 'volume')
        if (!destination || destination.status !== 'success') {
            throw new BadRequestException(destination?.error || 'Failed to upload project file')
        }
        const metadata = await this.assetService.createAsset(id, {
            name: file.originalname,
            path: file.originalname,
            kind: 'file',
            mimeType: file.mimetype,
            size: file.size,
            source: 'upload',
            status: 'available'
        })
        await this.automationService.triggerEvent(id, 'asset.created', metadata.id)
        return { url: destination.url, asset: metadata }
    }

    /**
     * Delete a file from the project volume.
     *
     * @param id
     * @param filePath
     */
    @UseGuards(XpertProjectGuard)
    @Delete(':id/file')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    async deleteFile(@Param('id') id: string, @Query('path') filePath: string) {
        const project = await this.service.findOne(id)
        const client = await this.volumeClient
            .resolve({
                tenantId: project.tenantId,
                userId: project.ownerId,
                catalog: 'projects',
                projectId: id
            })
            .ensureRoot()
        try {
            await client.deleteFile(filePath)
        } catch (error) {
            this.#logger.error(`Error deleting file: ${error.message}`, error.stack)
            throw new BadRequestException(getErrorMessage(error))
        }
    }

    /**
     * Add storage files as attachments to the project.
     *
     * @param id
     * @param files
     */
    @UseGuards(XpertProjectGuard)
    @Put(':id/attachments')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    async addAttachments(@Param('id') id: string, @Body() files: string[]) {
        await this.service.addAttachments(id, files)
    }

    @UseGuards(XpertProjectGuard)
    @Delete(':id/attachments/:file')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    async removeAttachments(@Param('id') id: string, @Param('file') file: string) {
        await this.service.removeAttachments(id, [file])
    }

    // @UseGuards(XpertProjectGuard)
    // @Get(':id/vcs')
    // async getVCS(@Param('id') id: string): Promise<IXpertProjectVCS> {
    // 	const integration = await this.service.findOne(id, { relations: ['vcs'] })
    // 	return integration.vcs
    // }

    // @UseGuards(XpertProjectGuard)
    // @Put(':id/vcs')
    // async updateVCS(@Param('id') id: string, @Body() entity: Partial<IXpertProjectVCS>): Promise<IXpertProjectVCS> {
    // 	return this.service.updateVCS(id, entity)
    // }

    // @Public()
    // @Get(':id/github-installation')
    // async GithubInstallation(@Param('id') id: string, @Res() res: Response) {
    // 	const project = await this.service.findOne(id, { relations: ['vcs'] })
    // 	if (!project.vcs?.auth) {
    // 		throw new BadRequestException('User is not authorized to access this resource')
    // 	}
    // 	const result = await this.githubService.installation(project.vcs.integrationId, project.vcs.auth)
    // 	if (result.redirect) {
    // 		return res.redirect(result.redirect)
    // 	}
    // }

    // @UseGuards(XpertProjectGuard)
    // @Get(':id/github-installations')
    // async getGithubInstallations(@Param('id') id: string) {
    // 	const project = await this.service.findOne(id, { relations: ['vcs'] })
    // 	if (!project.vcs?.auth) {
    // 		throw new BadRequestException('User is not authorized to access this resource')
    // 	}
    // 	return this.githubService.getInstallations(project.vcs.auth)
    // }
}
