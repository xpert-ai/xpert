import {
	IPluginRuntimeConvergenceStatus,
	IPluginRuntimeSnapshot,
	IRuntimeInstanceRegistration,
	IRuntimePluginRequirement,
	IRuntimeInstanceRetirementResult,
	IRuntimeRestartCapability,
	IRuntimeRestartResponse,
	IRuntimeRestartStatus,
	RUNTIME_RESTART_CONFIRMATION,
	PermissionsEnum,
	RolesEnum,
	RuntimeRestartMode
} from '@xpert-ai/contracts'
import { getDefaultTenantId, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { evaluatePermissions } from '../shared/guards/permission-policy'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { RuntimeInstanceRetirementDto, RuntimeRestartRequestDto } from './runtime-control.dto'
import { stalePluginRestart } from './plugin-restart-conflict'
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
		if (!this.hasAdministrativePermission()) {
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
		if (input.runtimeRequirements?.length && input.expectedGeneration === undefined) throw stalePluginRestart()
		return this.startAuthorizedRestart(input, audit)
	}

	/** Only server-owned installation results may introduce new desired requirements. */
	async activateStagedPlugins(
		requirements: IRuntimePluginRequirement[],
		reason: string
	): Promise<IRuntimeRestartResponse> {
		return this.startAuthorizedRestart({
			confirmation: RUNTIME_RESTART_CONFIRMATION,
			runtimeRequirements: requirements,
			reason
		})
	}

	async pluginRuntimeSnapshot(): Promise<IPluginRuntimeSnapshot> {
		this.assertAuthorizedActor()
		return this.coordinator.getPluginRuntimeSnapshot()
	}

	private async startAuthorizedRestart(
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
			...(input.allowDowntime === true ? { allowDowntime: true } : {}),
			reason: input.reason?.trim() || undefined,
			actorUserId: RequestContext.currentUserId(),
			tenantId: RequestContext.currentTenantId(),
			sourceIp: audit.sourceIp,
			runtimeRequirements: input.runtimeRequirements,
			...(input.expectedGeneration !== undefined ? { expectedGeneration: input.expectedGeneration } : {})
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
		const administrator = this.hasAdministrativePermission()
		const organizationId = RequestContext.getOrganizationId()
		const status = administrator
			? await this.coordinator.getPluginConvergenceStatus(generation)
			: organizationId
				? await this.coordinator.getPluginConvergenceStatus(generation, organizationId)
				: null
		if (!status) {
			throw new NotFoundException({
				statusCode: 404,
				errorCode: 'PLUGIN_RUNTIME_CONVERGENCE_NOT_FOUND',
				message: `Plugin runtime convergence generation ${generation} was not found`
			})
		}
		if (administrator) return status
		return {
			generation: status.generation,
			status: status.status,
			targetReplicaCount: status.targetReplicaCount,
			completedReplicaCount: status.completedReplicaCount,
			failedReplicaCount: status.failedReplicaCount,
			...(status.error
				? {
						error: t('server-ai:Error.PluginConvergenceFailed', {
							defaultValue: 'Plugin changes could not be applied. Contact your administrator.'
						})
					}
				: {})
		}
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

	private hasAdministrativePermission(): boolean {
		return (
			RequestContext.hasRole(RolesEnum.SUPER_ADMIN) &&
			evaluatePermissions(RequestContext.currentUser(), [PermissionsEnum.SUPER_ADMIN_EDIT]).allowed
		)
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
