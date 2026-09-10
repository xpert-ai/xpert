import {
    ConformanceTemplateProvider,
    CONFORMANCE_TEMPLATE_TARGET,
    assertTemplateConformanceEnabled
} from '../providers/conformance-template.provider'
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import type { EvolutionPageQuery, SubmitEvolutionChange } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, RequestContext } from '@xpert-ai/server-core'
import { EvolutionChangeService } from './change.service'
import { EvolutionLifecycleService } from './lifecycle.service'
import { evolutionSubmissionSchema } from './submission.schema'
import { changeError } from './change.errors'

@Controller('changes')
@UseGuards(PermissionGuard)
export class EvolutionLifecycleController {
    constructor(
        private readonly lifecycle: EvolutionLifecycleService,
        private readonly changes: EvolutionChangeService,
        private readonly fixture: ConformanceTemplateProvider
    ) {}
    @Post()
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    submit(@Body() body: unknown) {
        const parsed = evolutionSubmissionSchema.safeParse(body)
        if (!parsed.success) changeError('invalid_strategy_submission')
        const input = parsed.data as Omit<SubmitEvolutionChange, 'tenantId' | 'organizationId'>
        return this.changes.prepare({ ...input, ...identity() })
    }
    @Post('conformance-template')
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    async conformance(@Body() body: { requestId: string; strategyId: string }) {
        assertTemplateConformanceEnabled()
        const actor = context()
        const input = await this.fixture.fixtureInput(
            {
                ...identity(),
                targetId: CONFORMANCE_TEMPLATE_TARGET,
                scope: { type: 'organization', key: identity().organizationId },
                correlationId: body.requestId,
                actor: { actorId: actor.actorId, actorType: actor.actorType, actorRole: actor.actorRole }
            },
            body.requestId
        )
        return this.changes.prepare({
            ...input,
            strategyId: body.strategyId,
            sourceKind: body.strategyId === 'human_proposal' ? 'manual' : 'business_evidence'
        })
    }
    @Get()
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    list(@Query() query: EvolutionPageQuery) {
        return this.lifecycle.list(identity(), query)
    }
    @Get('records')
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    records(@Query('targetId') targetId?: string) {
        return this.changes.list({ ...identity(), targetId })
    }
    @Get(':id')
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    get(@Param('id') id: string) {
        return this.lifecycle.get(identity(), id)
    }
    @Post(':id/evaluations')
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    evaluate(@Param('id') id: string, @Body() body: { datasetSnapshotIds?: Record<string, string> }) {
        return this.lifecycle.evaluate(context(), id, body.datasetSnapshotIds)
    }
    @Post(':id/decisions')
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    decide(@Param('id') id: string, @Body() body: Parameters<EvolutionLifecycleService['decide']>[2]) {
        return this.lifecycle.decide(context(), id, body)
    }
    @Post(':id/publication')
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    publish(@Param('id') id: string) {
        return this.lifecycle.publish(context(), id)
    }
}
function identity() {
    return { tenantId: RequestContext.currentTenantId(), organizationId: RequestContext.getOrganizationId() }
}
function context() {
    const actorRoleName = RequestContext.currentUser()?.role?.name
    return {
        ...identity(),
        actorId: RequestContext.currentUserId(),
        actorRole: RequestContext.currentRoleId() ?? 'human_operator',
        actorRoleName,
        approvalAuthority:
            actorRoleName === RolesEnum.SUPER_ADMIN || actorRoleName === RolesEnum.ADMIN
                ? ('administrator' as const)
                : ('standard' as const),
        actorType: 'human' as const
    }
}
