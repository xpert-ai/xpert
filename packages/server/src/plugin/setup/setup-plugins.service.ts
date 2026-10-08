import { CommandBus } from '@nestjs/cqrs'
/**
 * Why this exists: individual installs normally start runtime convergence immediately.
 * Setup stages marketplace plugins sequentially, skips failures, then activates once.
 * Persist each item before continuing; a reload resumes the same job under the database lock.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
	RUNTIME_RESTART_CONFIRMATION,
	RolesEnum,
	type SetupPluginProgress,
	type SetupPluginsResponse,
	type SetupPluginCatalogQuery
} from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	getErrorMessage,
	ImportDefaultAgentPluginsCommand
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { PluginInstanceService } from '../plugin-instance.service'
import { PluginManagementService } from '../plugin-management.service'
import { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import { SetupPluginsCatalog } from './setup-plugins.catalog'
import { SetupPluginsStore } from './setup-plugins.store'

@Injectable()
export class SetupPluginsService {
	private readonly logger = new Logger(SetupPluginsService.name)
	constructor(
		private readonly store: SetupPluginsStore,
		private readonly plugins: PluginManagementService,
		private readonly instances: PluginInstanceService,
		private readonly runtime: RuntimeControlService,
		private readonly marketplace: SetupPluginsCatalog,
		private readonly commands: CommandBus
	) {}

	async catalog(query: SetupPluginCatalogQuery) {
		await this.authorize()
		return this.marketplace.list(query, RequestContext.getOrganizationId())
	}

	async status(): Promise<SetupPluginsResponse> {
		const tenantId = await this.authorize()
		const progress = await this.store.read(tenantId)
		const savedPhase = progress.phase
		if (progress.phase === 'restarting') {
			try {
				const status = progress.generation
					? await this.runtime.pluginConvergenceStatus(progress.generation)
					: progress.restartId
						? await this.runtime.restartStatus(progress.restartId)
						: null
				if (status?.status === 'completed') progress.phase = 'completed'
				if (status?.status === 'failed') {
					progress.phase = 'attention'
					progress.error = status.error
				}
				if (!status && Date.now() - Date.parse(progress.updatedAt) > 30_000) {
					progress.phase = 'attention'
				}
			} catch (error) {
				if (!(error instanceof NotFoundException)) throw error
				// A missing cluster receipt cannot prove that every replacement loaded the plugins.
				progress.phase = 'attention'
			}
		}
		if (progress.phase === 'completed' && savedPhase !== 'completed') {
			const release = await this.store.acquire(tenantId)
			if (release) {
				try {
					const current = await this.store.read(tenantId)
					if (current.phase === savedPhase && current.updatedAt === progress.updatedAt) {
						await this.store.save(tenantId, progress)
					}
				} finally {
					await release()
				}
			}
		}
		return { progress, automaticRestart: this.runtime.restartCapability().allowed }
	}

	async start(names: string[], importDefaultAgentPlugins = true): Promise<SetupPluginsResponse> {
		const tenantId = await this.authorize()
		const release = await this.store.acquire(tenantId)
		if (!release) return this.status()
		let handedOff = false
		try {
			const { progress } = await this.status()
			if (progress.phase !== 'idle' && progress.phase !== 'installing') return this.status()
			const organizationId = RequestContext.getOrganizationId()
			if (
				progress.phase === 'installing' &&
				progress.organizationId !== undefined &&
				progress.organizationId !== organizationId
			) {
				throw new BadRequestException(
					t('server:Error.SetupPluginOrganization', {
						defaultValue: 'Resume setup in the organization where installation started.'
					})
				)
			}
			if (progress.phase === 'idle') {
				const choices = await this.marketplace.resolve(names, organizationId)
				if (importDefaultAgentPlugins && (!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE)) {
					throw new BadRequestException(t('server:Error.SetupPluginOrganization'))
				}
				progress.organizationId = organizationId
				progress.defaultAgentPlugins = importDefaultAgentPlugins ? { status: 'pending' } : undefined
				progress.items = choices.map((choice) => ({
					...choice,
					status: 'pending',
					runtimeRequirements: []
				}))
				progress.phase = 'installing'
				await this.store.save(tenantId, progress)
			}
			// The authenticated request context is inherited by this async continuation.
			// The database lock, not the HTTP connection, owns the installation lifetime.
			const response: SetupPluginsResponse = {
				progress: structuredClone(progress),
				automaticRestart: this.runtime.restartCapability().allowed
			}
			handedOff = true
			void this.run(tenantId, progress)
				.catch(async (error: unknown) => {
					progress.phase = 'attention'
					progress.error = getErrorMessage(error)
					await this.store.save(tenantId, progress)
				})
				.finally(release)
				.catch((error: unknown) => this.logger.error(getErrorMessage(error)))
			return response
		} finally {
			if (!handedOff) await release()
		}
	}

	private async run(tenantId: string, progress: SetupPluginProgress) {
		for (const item of progress.items) {
			if (item.status !== 'pending' && item.status !== 'installing') continue
			if (this.plugins.findLoadedPlugin(item.packageName, progress.organizationId ?? GLOBAL_ORGANIZATION_SCOPE)) {
				item.status = 'existing'
				await this.store.save(tenantId, progress)
				continue
			}
			item.status = 'installing'
			await this.store.save(tenantId, progress)
			try {
				const result = await this.plugins.installPlugin(
					{ pluginName: item.packageName, version: item.version, source: 'npm' },
					{ deferActivation: true, requiredLevel: item.level }
				)
				item.status = 'installed'
				item.runtimeRequirements = result.runtimeRequirements ?? []
			} catch (error) {
				item.status = 'failed'
				item.error = getErrorMessage(error)
			}
			await this.store.save(tenantId, progress)
		}
		const defaults = progress.defaultAgentPlugins
		if (defaults && (defaults.status === 'pending' || defaults.status === 'importing')) {
			defaults.status = 'importing'
			await this.store.save(tenantId, progress)
			try {
				defaults.result = await this.commands.execute(new ImportDefaultAgentPluginsCommand())
				defaults.status = 'completed'
			} catch (error) {
				defaults.status = 'failed'
				defaults.error = getErrorMessage(error)
			}
			await this.store.save(tenantId, progress)
		}
		const requirements = progress.items.flatMap((item) => item.runtimeRequirements)
		if (!requirements.length) {
			progress.phase = 'completed'
			await this.store.save(tenantId, progress)
			return
		}
		progress.phase = 'restarting'
		await this.store.save(tenantId, progress)
		const restart = await this.runtime.requestRestart({
			confirmation: RUNTIME_RESTART_CONFIRMATION,
			reason: 'Apply plugins selected during system setup',
			runtimeRequirements: requirements
		})
		progress.restartId = restart.restartId
		progress.generation = restart.pluginGeneration
		await this.store.save(tenantId, progress)
	}

	private async authorize(): Promise<string> {
		const tenantId = RequestContext.currentTenantId()
		if (
			RequestContext.currentApiKey() ||
			!RequestContext.hasRole(RolesEnum.SUPER_ADMIN) ||
			!tenantId ||
			tenantId !== (await this.instances.getDefaultTenantId())
		) {
			throw new ForbiddenException(
				t('server:Error.SetupPluginAdmin', {
					defaultValue: 'System setup requires a SuperAdmin session in the default tenant.'
				})
			)
		}
		return tenantId
	}
}
