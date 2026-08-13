import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, RequestContext } from '@xpert-ai/server-core'
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AgentEvolutionService } from '../application'

@ApiTags('Agent Evolution')
@ApiBearerAuth()
@Controller()
export class AgentEvolutionController {
    constructor(private readonly service: AgentEvolutionService) {}

    @Get('dashboard')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    getDashboard() {
        return this.service.getDashboard({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId()
        })
    }

    @Post('targets/synchronize')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE, AIPermissionsEnum.XPERT_EDIT)
    synchronizeTargets() {
        return this.service.synchronizeTargets({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId()
        })
    }

    @Post('simulations/conformance')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE, AIPermissionsEnum.XPERT_EDIT)
    simulate() {
        return this.service.runConformanceSimulation({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            actorId: RequestContext.currentUserId(),
            actorRole: 'human_operator'
        })
    }

    @Post('examples/conformance-field-mapping/run')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE, AIPermissionsEnum.XPERT_EDIT)
    runConformanceFieldMappingExample() {
        return this.service.runConformanceSimulation({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            actorId: RequestContext.currentUserId(),
            actorRole: 'human_operator'
        })
    }
}
