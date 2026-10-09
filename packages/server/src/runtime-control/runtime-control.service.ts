import {
	IPluginRuntimeConvergenceStatus,
	IRuntimeInstanceRegistration,
	IRuntimePluginRequirement,
	IRuntimeInstanceRetirementResult,
	IRuntimeRestartCapability,
	IRuntimeRestartResponse,
	IRuntimeRestartStatus,
	RUNTIME_RESTART_CONFIRMATION,
	RolesEnum,
	RuntimeRestartMode
} from '@xpert-ai/contracts'
import { getDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { RequestContext } from '../core/context'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { RuntimeInstanceRetirementDto, RuntimeRestartRequestDto } from './runtime-control.dto'
import {
	PluginRuntimeChangeInput,
	PluginRuntimeChangeResult,
	RuntimeRestartCoordinatorService
} from './runtime-restart-coordinator.service'

export { RUNTIME_PROCESS_SIGNALER, RuntimeProcessSignaler } from './runtime-process-signaler'

export interface RuntimeRestartAuditContext {
	sourceIp?: string
}

@Injectable()
export class RuntimeControlService {
	private readonly mode: RuntimeRestartMode = 'rolling-self-signal'

	private readonly logger = new Logger(RuntimeControlService.name)

	constructor(
		private readonly coordinator: RuntimeRestartCoordinatorService,
		@Inject(InstanceRegistryService)
		private readonly instances: Pick<InstanceRegistryService, 'getRegisteredInstanceDetails' | 'retireInstance'>
	) {}

	async listInstances(): Promise<IRuntimeInstanceRegistration[]> {
		this.assertAuthorizedActor()
		return this.instances.getRegisteredInstanceDetails()
	}

	async retireInstance(
		instanceId: string,
		input: RuntimeInstanceRetirementDto,
		audit: RuntimeRestartAuditContext = {}
	): Promise<IRuntimeInstanceRetirementResult> {
		this.assertAuthorizedActor()
		const result = await this.instances.retireInstance(instanceId, input.expectedBootId)
		this.logger.log(
			JSON.stringify({
				event: 'runtime.instance.retirement',
				instanceId,
				expectedBootId: input.expectedBootId,
				status: result.status,
				actorUserId: RequestContext.currentUserId(),
				tenantId: RequestContext.currentTenantId(),
				sourceIp: audit.sourceIp
			})
		)
		return result
	}

	restartCapability(): IRuntimeRestartCapability {
		if (RequestContext.currentApiKey()) {
			return { allowed: false, mode: this.mode, reason: 'interactive-auth-required' }
		}
		if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
			return { allowed: false, mode: this.mode, reason: 'super-admin-required' }
		}

		const defaultTenantId = getDefaultTenantId()
		if (!defaultTenantId || RequestContext.currentTenantId() !== defaultTenantId) {
			return { allowed: false, mode: this.mode, reason: 'default-tenant-required' }
		}
		return { allowed: true, mode: this.mode, reason: 'allowed' }
	}

	async requestRestart(
		input: RuntimeRestartRequestDto,
		audit: RuntimeRestartAuditContext = {}
	): Promise<IRuntimeRestartResponse> {
		this.assertAuthorizedActor()
		if (input.confirmation !== RUNTIME_RESTART_CONFIRMATION) {
			throw new BadRequestException({
				statusCode: 400,
				errorCode: 'RUNTIME_RESTART_CONFIRMATION_REQUIRED',
				message: `confirmation must equal ${RUNTIME_RESTART_CONFIRMATION}`
			})
		}

		return await this.coordinator.requestRestart({
			source: 'interactive',
			reason: input.reason?.trim() || undefined,
			actorUserId: RequestContext.currentUserId(),
			tenantId: RequestContext.currentTenantId(),
			sourceIp: audit.sourceIp,
			runtimeRequirements: input.runtimeRequirements
		})
	}

	async restartStatus(restartId: string): Promise<IRuntimeRestartStatus> {
		const status = await this.coordinator.getStatus(restartId)
		if (!status) {
			throw new NotFoundException({
				statusCode: 404,
				errorCode: 'RUNTIME_RESTART_NOT_FOUND',
				message: `Runtime restart ${restartId} was not found`
			})
		}
		return status
	}

	async pluginConvergenceStatus(generation: number): Promise<IPluginRuntimeConvergenceStatus> {
		const status = await this.coordinator.getPluginConvergenceStatus(generation)
		if (!status) {
			throw new NotFoundException({
				statusCode: 404,
				errorCode: 'PLUGIN_RUNTIME_CONVERGENCE_NOT_FOUND',
				message: `Plugin runtime convergence generation ${generation} was not found`
			})
		}
		return status
	}

	async recordPluginRuntimeChange(input: PluginRuntimeChangeInput): Promise<PluginRuntimeChangeResult> {
		return await this.coordinator.recordPluginChange(input)
	}

	async recordPluginRuntimeRequirements(
		requirements: IRuntimePluginRequirement[],
		reason: string
	): Promise<PluginRuntimeChangeResult> {
		return this.coordinator.recordPluginRequirements(requirements, reason)
	}

	private assertAuthorizedActor(): void {
		const capability = this.restartCapability()
		if (capability.reason === 'interactive-auth-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_INTERACTIVE_AUTH_REQUIRED',
				message: 'API runtime restart requires an interactive SuperAdmin session'
			})
		}
		if (capability.reason === 'super-admin-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_SUPER_ADMIN_REQUIRED',
				message: 'Only SuperAdmin users can restart the API runtime'
			})
		}
		if (capability.reason === 'default-tenant-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_DEFAULT_TENANT_REQUIRED',
				message: 'API runtime restart is restricted to the default tenant'
			})
		}
	}
}
