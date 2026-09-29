import {
    AIPermissionsEnum,
    IXpertProjectTask,
    IXpertProjectTaskConversation,
    IXpertProjectTaskExecution,
    IXpertProjectPlan,
    IXpertProjectMilestone,
    IXpertProjectSprint,
    IXpertProjectSwimlane
} from '@xpert-ai/contracts'
import { CrudController, PaginationParams, ParseJsonPipe } from '@xpert-ai/server-core'
import { Body, Delete, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ProjectPermission, XpertProjectGuard } from './guards'
import { XpertProjectTaskDto } from './dto'
import { XpertProject } from './entities/project.entity'
import { XpertProjectTask } from './entities/project-task.entity'
import { XpertProjectService } from './project.service'
import { XpertProjectPlanService, XpertProjectActivityService, XpertProjectAutomationService } from './services'

/** Keep inherited route metadata intact while grouping planning endpoints. */
export abstract class XpertProjectPlanningController extends CrudController<XpertProject> {
    constructor(
        private readonly planningProjects: XpertProjectService,
        private readonly planningPlans: XpertProjectPlanService,
        private readonly planningActivity: XpertProjectActivityService,
        private readonly planningAutomation: XpertProjectAutomationService
    ) {
        super(planningProjects)
    }

    @UseGuards(XpertProjectGuard)
    @Get(':id/tasks')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    async getTasks(@Param('id') id: string, @Query('data', ParseJsonPipe) params: PaginationParams<XpertProjectTask>) {
        const { items } = await this.planningProjects.getTasks(id, params)
        return items.map((_) => new XpertProjectTaskDto(_))
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/tasks')
    async createTask(@Param('id') id: string, @Body() task: Partial<IXpertProjectTask>) {
        const created = await this.planningProjects.createTasks(id, task)
        await this.planningActivity.record(id, {
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
        const task = await this.planningProjects.getTasks(id, {
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
        return this.planningProjects.getTaskRelations(id, taskId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Put(':id/tasks/order')
    async reorderTasks(@Param('id') id: string, @Body() input: Array<{ id: string; order: number; column?: string }>) {
        const tasks = await this.planningProjects.reorderTasks(id, input ?? [])
        await this.planningActivity.record(id, {
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
            assigneeXpertId?: string
            priority?: IXpertProjectTask['priority']
        }
    ) {
        const tasks = await this.planningProjects.batchUpdateTasks(id, input)
        await this.planningActivity.record(id, {
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
        const updated = await this.planningProjects.updateTask(id, taskId, task)
        await this.planningActivity.record(id, {
            type: 'task.updated',
            summary: `Task ${updated.title || updated.name} updated`,
            entityType: 'task',
            entityId: taskId,
            payload: task.status ? { status: task.status } : undefined
        })
        if (task.status) await this.planningAutomation.triggerEvent(id, 'task.status_changed', taskId)
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
        return this.planningProjects.linkTaskConversation(id, taskId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/tasks/:taskId/executions')
    createTaskExecution(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body() input: Partial<IXpertProjectTaskExecution>
    ) {
        return this.planningProjects.createTaskExecution(id, taskId, input)
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
        return this.planningProjects.updateTaskExecution(id, taskId, executionId, input)
    }

    // Plans and milestones
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/plans')
    listPlans(@Param('id') id: string) {
        return this.planningPlans.list(id)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans')
    createPlan(@Param('id') id: string, @Body() input: Partial<IXpertProjectPlan>) {
        return this.planningPlans.createPlan(id, input).then((plan) => {
            void this.planningActivity.record(id, {
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
        const plan = await this.planningPlans.updatePlan(id, planId, input)
        await this.planningActivity.record(id, {
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
        return this.planningPlans.removePlan(id, planId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans/:planId/milestones')
    createMilestone(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Body() input: Partial<IXpertProjectMilestone>
    ) {
        return this.planningPlans.createMilestone(id, planId, input).then((milestone) => {
            void this.planningActivity.record(id, {
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
        return this.planningPlans.updateMilestone(id, planId, milestoneId, input).then((milestone) => {
            void this.planningActivity.record(id, {
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
        return this.planningPlans.removeMilestone(id, planId, milestoneId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/plans/:planId/sprints')
    listSprints(@Param('id') id: string, @Param('planId') planId: string) {
        return this.planningPlans.listSprints(id, planId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/plans/:planId/sprints')
    createSprint(
        @Param('id') id: string,
        @Param('planId') planId: string,
        @Body() input: Partial<IXpertProjectSprint>
    ) {
        return this.planningPlans.createSprint(id, planId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Put(':id/sprints/:sprintId')
    updateSprint(
        @Param('id') id: string,
        @Param('sprintId') sprintId: string,
        @Body() input: Partial<IXpertProjectSprint>
    ) {
        return this.planningPlans.updateSprint(id, sprintId, input)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @UseGuards(XpertProjectGuard)
    @Get(':id/sprints/:sprintId/swimlanes')
    listSwimlanes(@Param('id') id: string, @Param('sprintId') sprintId: string) {
        return this.planningPlans.listSwimlanes(id, sprintId)
    }

    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @UseGuards(XpertProjectGuard)
    @Post(':id/sprints/:sprintId/swimlanes')
    createSwimlane(
        @Param('id') id: string,
        @Param('sprintId') sprintId: string,
        @Body() input: Partial<IXpertProjectSwimlane>
    ) {
        return this.planningPlans.createSwimlane(id, sprintId, input)
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
        return this.planningPlans.updateSwimlane(id, sprintId, swimlaneId, input)
    }
}
