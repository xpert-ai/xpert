import type {
    BuildCandidateCommand,
    DiagnoseLearningEventsRequest,
    CreateDatasetSnapshotRequest,
    CreateEvolutionExperienceRequest,
    CreateEvolutionCanaryTestOverrideRequest,
    CreateImprovementProposalRequest,
    CreateReleasePackageRequest,
    DecideCandidateApprovalRequest,
    EvaluateCandidateCommand,
    EvolutionPageQuery,
    ResolveCapabilityExecutionPlanRequest,
    ReviewLearningEventRequest,
    StartDeploymentRequest
} from '@xpert-ai/contracts'
import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, RequestContext } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    AgentEvolutionGovernanceService,
    AgentEvolutionAnalystService,
    AgentEvolutionQueueService,
    AgentEvolutionRuntimeService,
    AgentEvolutionService
} from '../application'

@ApiTags('Agent Evolution')
@ApiBearerAuth()
@Controller()
export class AgentEvolutionController {
    constructor(
        private readonly service: AgentEvolutionService,
        private readonly governance: AgentEvolutionGovernanceService,
        private readonly analyst: AgentEvolutionAnalystService,
        private readonly queue: AgentEvolutionQueueService,
        private readonly runtime: AgentEvolutionRuntimeService
    ) {}

    @Get('dashboard')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    getDashboard() {
        return this.service.getDashboard(requestScope())
    }

    @Get('targets')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listTargets(@Query() query: EvolutionPageQuery) {
        return this.governance.listTargets(commandContext(), normalizeQuery(query))
    }

    @Get('capability-versions')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listCapabilityVersions(@Query() query: EvolutionPageQuery) {
        return this.governance.listCapabilityVersions(commandContext(), normalizeQuery(query))
    }

    @Get('capability-bundles')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listCapabilityBundles(@Query() query: EvolutionPageQuery) {
        return this.governance.listCapabilityBundles(commandContext(), normalizeQuery(query))
    }

    @Get('active-pointers')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listActivePointers(@Query() query: EvolutionPageQuery) {
        return this.governance.listActivePointers(commandContext(), normalizeQuery(query))
    }

    @Get('learning-events')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listLearningEvents(@Query() query: EvolutionPageQuery) {
        return this.governance.listLearningEvents(commandContext(), normalizeQuery(query))
    }

    @Patch('learning-events/:eventId/review')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    reviewLearningEvent(@Param('eventId') eventId: string, @Body() body: ReviewLearningEventRequest) {
        return this.governance.reviewLearningEvent(commandContext(), eventId, body.reviewStatus)
    }

    @Get('diagnoses')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listDiagnoses(@Query() query: EvolutionPageQuery) {
        return this.analyst.listDiagnoses(commandContext(), normalizeQuery(query))
    }

    @Get('clusters')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listClusters(@Query() query: EvolutionPageQuery) {
        return this.analyst.listClusters(commandContext(), normalizeQuery(query))
    }

    @Post('diagnoses')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    diagnoseLearningEvents(@Body() body: DiagnoseLearningEventsRequest) {
        return this.analyst.diagnose(commandContext(), body)
    }

    @Post('proposals')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    createProposal(@Body() body: CreateImprovementProposalRequest) {
        return this.governance.createProposal(commandContext(), body)
    }

    @Get('proposals')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listProposals(@Query() query: EvolutionPageQuery) {
        return this.governance.listProposals(commandContext(), normalizeQuery(query))
    }

    @Get('candidates')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listCandidates(@Query() query: EvolutionPageQuery) {
        return this.governance.listCandidates(commandContext(), normalizeQuery(query))
    }

    @Post('candidates')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    buildCandidate(@Body() body: BuildCandidateCommand) {
        return this.governance.buildCandidate(commandContext(), body)
    }

    @Post('candidates/:candidateId/approvals')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    decideApproval(@Param('candidateId') candidateId: string, @Body() body: DecideCandidateApprovalRequest) {
        return this.governance.decideApproval(commandContext(), candidateId, body)
    }

    @Get('datasets')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listDatasets(@Query() query: EvolutionPageQuery) {
        return this.governance.listDatasets(commandContext(), normalizeQuery(query))
    }

    @Post('datasets')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    createDataset(@Body() body: CreateDatasetSnapshotRequest) {
        return this.governance.createDatasetSnapshot(commandContext(), body)
    }

    @Get('evaluations')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listEvaluations(@Query() query: EvolutionPageQuery) {
        return this.governance.listEvaluations(commandContext(), normalizeQuery(query))
    }

    @Post('evaluations')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    enqueueEvaluation(@Body() body: EvaluateCandidateCommand) {
        return this.queue.enqueueEvaluation(commandContext(), body)
    }

    @Get('releases')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listReleases(@Query() query: EvolutionPageQuery) {
        return this.governance.listReleases(commandContext(), normalizeQuery(query))
    }

    @Get('deployments')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listDeployments(@Query() query: EvolutionPageQuery) {
        return this.governance.listDeployments(commandContext(), normalizeQuery(query))
    }

    @Get('releases/:releasePackageId/canary-test-overrides')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listCanaryTestOverrides(@Param('releasePackageId') releasePackageId: string) {
        return this.governance.listCanaryTestOverrides(commandContext(), releasePackageId)
    }

    @Post('releases/:releasePackageId/canary-test-overrides')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    createCanaryTestOverride(
        @Param('releasePackageId') releasePackageId: string,
        @Body() body: CreateEvolutionCanaryTestOverrideRequest
    ) {
        return this.governance.createCanaryTestOverride(commandContext(), releasePackageId, body)
    }

    @Get('runtime-observations')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listRuntimeObservations(@Query() query: EvolutionPageQuery) {
        return this.governance.listRuntimeObservations(commandContext(), normalizeQuery(query))
    }

    @Get('audit-events')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listAuditEvents(@Query() query: EvolutionPageQuery) {
        return this.governance.listAuditEvents(commandContext(), normalizeQuery(query))
    }

    @Get('experiences')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    listExperiences(@Query() query: EvolutionPageQuery) {
        return this.governance.listExperiences(commandContext(), normalizeQuery(query))
    }

    @Post('experiences')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    createExperience(@Body() body: CreateEvolutionExperienceRequest) {
        return this.governance.createExperience(commandContext(), body)
    }

    @Post('release-packages')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    createReleasePackage(@Body() body: CreateReleasePackageRequest) {
        return this.governance.createReleasePackage(commandContext(), body)
    }

    @Post('releases/:releasePackageId/install')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    installRelease(@Param('releasePackageId') releasePackageId: string) {
        return this.queue.enqueueReleaseOperation(commandContext(), 'install', releasePackageId)
    }

    @Post('releases/:releasePackageId/shadow')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    startShadow(@Param('releasePackageId') releasePackageId: string) {
        return this.queue.enqueueReleaseOperation(commandContext(), 'shadow', releasePackageId)
    }

    @Post('releases/:releasePackageId/canary')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    startCanary(@Param('releasePackageId') releasePackageId: string, @Body() body: StartDeploymentRequest) {
        return this.queue.enqueueReleaseOperation(commandContext(), 'canary', releasePackageId, body)
    }

    @Post('releases/:releasePackageId/pause')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    pauseRelease(@Param('releasePackageId') releasePackageId: string) {
        return this.governance.pauseRelease(commandContext(), releasePackageId)
    }

    @Post('releases/:releasePackageId/activate')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    activateRelease(@Param('releasePackageId') releasePackageId: string) {
        return this.governance.activateProduction(commandContext(), releasePackageId)
    }

    @Post('releases/:releasePackageId/rollback')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    rollbackRelease(@Param('releasePackageId') releasePackageId: string) {
        return this.queue.enqueueReleaseOperation(commandContext(), 'rollback', releasePackageId)
    }

    @Get('jobs/:jobId')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT)
    getJob(@Param('jobId') jobId: string) {
        return this.queue.getJob(commandContext(), jobId)
    }

    @Post('capability-executions/resolve')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    resolveExecutionPlan(@Body() body: Omit<ResolveCapabilityExecutionPlanRequest, 'tenantId' | 'organizationId'>) {
        const scope = requestScope()
        return this.runtime.resolveExecutionPlan({ ...body, ...scope })
    }

    @Post('targets/synchronize')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    synchronizeTargets() {
        return this.service.synchronizeTargets(requestScope())
    }

    @Post('simulations/conformance')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    simulate() {
        assertConformanceEnabled()
        return this.service.runConformanceSimulation(commandContext())
    }

    @Post('examples/conformance-field-mapping/run')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.EVOLUTION_MANAGE)
    runConformanceFieldMappingExample() {
        assertConformanceEnabled()
        return this.service.runConformanceSimulation(commandContext())
    }
}

function requestScope() {
    return {
        tenantId: RequestContext.currentTenantId(),
        organizationId: RequestContext.getOrganizationId()
    }
}

function commandContext() {
    const currentUser = RequestContext.currentUser()
    const actorRoleName = currentUser?.role?.name
    return {
        ...requestScope(),
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

function normalizeQuery(query: EvolutionPageQuery): EvolutionPageQuery {
    const order = query.order === 'ASC' ? 'ASC' : 'DESC'
    const sort = query.sort === 'updatedAt' || query.sort === 'status' ? query.sort : 'createdAt'
    return {
        page: Number(query.page ?? 1),
        pageSize: Number(query.pageSize ?? 20),
        search: typeof query.search === 'string' ? query.search.trim().slice(0, 200) : undefined,
        targetId: typeof query.targetId === 'string' ? query.targetId.trim().slice(0, 160) : undefined,
        status: typeof query.status === 'string' ? query.status.trim().slice(0, 80) : undefined,
        sort,
        order
    }
}

function assertConformanceEnabled() {
    if (environment.production && process.env.AGENT_EVOLUTION_ENABLE_CONFORMANCE !== 'true') {
        throw new NotFoundException()
    }
}
