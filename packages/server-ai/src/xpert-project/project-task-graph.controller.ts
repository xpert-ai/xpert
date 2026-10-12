import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { z } from 'zod/v3'
import { projectTaskPlanSchema } from './project-task-plan.schema'
import { ProjectPermission, XpertProjectGuard } from './guards'
import { ProjectTaskGraphService } from './services/project-task-graph.service'

@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectTaskGraphController {
    constructor(private readonly tasks: ProjectTaskGraphService) {}

    private context(projectId: string) {
        return {
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        }
    }

    @Get(':id/task-graph')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    graph(@Param('id') id: string) {
        return this.tasks.graph(this.context(id))
    }

    @Put(':id/task-graph')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    change(@Param('id') id: string, @Body() input: z.infer<typeof projectTaskPlanSchema>) {
        const result = projectTaskPlanSchema.safeParse(input)
        if (!result.success) throw new BadRequestException(result.error.issues)
        const parsed = result.data
        return this.tasks.change(this.context(id), {
            ...parsed,
            taskId: parsed.taskId!,
            expectedRevision: parsed.expectedRevision!
        })
    }

    @Get(':id/task-executions/:executionId/target')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    target(@Param('id') id: string, @Param('executionId') executionId: string) {
        return this.tasks.resolveExecution(this.context(id), executionId)
    }
}
