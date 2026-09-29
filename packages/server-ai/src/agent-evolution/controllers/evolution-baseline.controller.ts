import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, RequestContext } from '@xpert-ai/server-core'
import { EvolutionBaselineService } from '../application/evolution-baseline.service'

@Controller('baselines')
export class EvolutionBaselineController {
    constructor(private readonly baselines: EvolutionBaselineService) {}

    @Get(':targetId')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT, AIPermissionsEnum.EVOLUTION_MANAGE)
    inspect(@Param('targetId') targetId: string) {
        return this.baselines.inspect({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            targetId
        })
    }
}
