import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { IPluginUninstallResult, IRuntimePluginRequirement, PLUGIN_LEVEL } from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import { PluginInstanceService } from '../plugin-instance.service'
import { findLoadedPluginByLevels } from '../plugin-install-policy'
import { resolvePluginLevel } from '../plugin-instance.entity'
import { PluginRuntimeStateService } from '../plugin-runtime-state.service'
import { canManageGlobalPlugins, canManageSystemPlugins, canManageTenantPlugins } from '../plugin-update.utils'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from '../types'

@Injectable()
export class PluginUninstallService {
	private readonly logger = new Logger(PluginUninstallService.name)
	constructor(
		@Inject(LOADED_PLUGINS) private readonly loadedPlugins: LoadedPluginRecord[],
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly strategyBus: StrategyBus,
		private readonly runtimeControl: RuntimeControlService,
		private readonly runtimeState: PluginRuntimeStateService
	) {}

	async uninstallByNamesWithGuard(
		names: string[],
		targetOrganizationId?: string,
		targetScopeKey?: string
	): Promise<Omit<IPluginUninstallResult, 'success'>> {
		const scopeContext = RequestContext.getScope?.() ?? { tenantId: null, organizationId: null }
		const currentOrganizationId = scopeContext.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const tenantId = scopeContext.tenantId ?? RequestContext.currentTenantId()
		const defaultTenantId = await this.pluginInstanceService.getDefaultTenantId()
		const organizationId = this.resolveUninstallOrganizationId(currentOrganizationId, targetOrganizationId)
		const allowSystemPlugins =
			currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE &&
			organizationId === GLOBAL_ORGANIZATION_SCOPE &&
			canManageSystemPlugins(currentOrganizationId, defaultTenantId)
		const targetsLoadedSystemPlugin = !targetScopeKey && !!this.findLoadedSystemPlugin(names)
		const tenantGlobalScopeKey = resolveTenantGlobalScopeKey(tenantId)
		const scopeKey =
			targetScopeKey ??
			(targetsLoadedSystemPlugin
				? SYSTEM_GLOBAL_SCOPE
				: organizationId === GLOBAL_ORGANIZATION_SCOPE
					? resolveTenantGlobalScopeKey(tenantId)
					: organizationId)
		if (scopeKey === SYSTEM_GLOBAL_SCOPE && !canManageSystemPlugins(GLOBAL_ORGANIZATION_SCOPE, defaultTenantId)) {
			throw new ForbiddenException('Only super admins can uninstall system plugins')
		}
		this.assertNoSystemPlugins(names, allowSystemPlugins, scopeKey)
		const loadedRestartRequiredPlugin = this.findLoadedRestartRequiredPlugin(names, scopeKey)
		const loadedRestartRequiredLevel = loadedRestartRequiredPlugin
			? resolvePluginLevel(loadedRestartRequiredPlugin.level ?? loadedRestartRequiredPlugin.instance?.meta?.level)
			: null
		if (loadedRestartRequiredLevel === PLUGIN_LEVEL.TENANT) {
			if (scopeKey !== tenantGlobalScopeKey || !canManageTenantPlugins(tenantId)) {
				throw new ForbiddenException(
					'Tenant-level plugins can only be uninstalled by a Super Admin in their tenant'
				)
			}
		}
		if (scopeKey === SYSTEM_GLOBAL_SCOPE || loadedRestartRequiredLevel === PLUGIN_LEVEL.TENANT) {
			await this.pluginInstanceService.deactivate(tenantId, organizationId, names, { scopeKey })
			for (const name of names) this.strategyBus.remove(scopeKey, normalizePluginName(name), 'uninstall')
			this.logger.log(
				`Deactivated persisted registrations for ${loadedRestartRequiredLevel ?? 'system'}-level plugins ${names.join(', ')}; API restart required for unload`
			)
			return {
				restartRequired: true,
				runtimeRequirements: names.map((name) => ({
					scopeKey,
					pluginName: normalizePluginName(name),
					state: 'absent'
				}))
			}
		}
		await this.pluginInstanceService.uninstall(tenantId, organizationId, names, {
			scopeKey,
			cause: 'uninstall'
		})
		await this.runtimeState.report()
		const runtimeRequirements: IRuntimePluginRequirement[] = names.map((name) => ({
			scopeKey,
			pluginName: normalizePluginName(name),
			state: 'absent'
		}))
		const convergence = await this.runtimeControl.recordPluginRuntimeRequirements(
			runtimeRequirements,
			`Uninstall ${names.join(', ')} in ${scopeKey}`
		)
		return {
			runtimeRequirements,
			...(convergence.scheduled
				? { runtimeConvergence: { generation: convergence.generation } }
				: { restartRequired: true })
		}
	}

	private resolveUninstallOrganizationId(currentOrganizationId: string, targetOrganizationId?: string) {
		if (!targetOrganizationId || targetOrganizationId === currentOrganizationId) {
			if (currentOrganizationId === GLOBAL_ORGANIZATION_SCOPE && !canManageGlobalPlugins()) {
				throw new ForbiddenException('Only super admins can uninstall global plugins')
			}
			return currentOrganizationId
		}

		if (targetOrganizationId === GLOBAL_ORGANIZATION_SCOPE) {
			if (!canManageGlobalPlugins()) {
				throw new ForbiddenException('Only super admins can uninstall global plugins')
			}
			return GLOBAL_ORGANIZATION_SCOPE
		}

		throw new ForbiddenException('Plugins can only be uninstalled from the current or global organization scope')
	}

	private assertNoSystemPlugins(pluginNamesOrPackages: string[], allowSystemPlugins = false, scopeKey?: string) {
		const matched = this.findLoadedSystemPlugin(pluginNamesOrPackages, scopeKey)

		if (matched && !allowSystemPlugins) {
			throw new BadRequestException(t('server:Error.PluginSystemUninstallForbidden', { name: matched.name }))
		}
	}

	private findLoadedSystemPlugin(pluginNamesOrPackages: string[], scopeKey?: string) {
		return findLoadedPluginByLevels(this.loadedPlugins, pluginNamesOrPackages, [PLUGIN_LEVEL.SYSTEM], scopeKey)
	}

	private findLoadedRestartRequiredPlugin(pluginNamesOrPackages: string[], scopeKey?: string) {
		return findLoadedPluginByLevels(
			this.loadedPlugins,
			pluginNamesOrPackages,
			[PLUGIN_LEVEL.SYSTEM, PLUGIN_LEVEL.TENANT],
			scopeKey
		)
	}

	async uninstallByPackageNameWithGuard(
		tenantId: string | null,
		organizationId: string,
		packageName: string,
		allowSystemPlugins = false,
		scopeKey?: string | null,
		cause?: 'refresh' | 'uninstall'
	) {
		const resolvedScopeKey =
			scopeKey ??
			(organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId)
		this.assertNoSystemPlugins([packageName], allowSystemPlugins, resolvedScopeKey)
		await this.pluginInstanceService.uninstallByPackageName(tenantId, organizationId, packageName, {
			scopeKey: resolvedScopeKey,
			cause
		})
	}
}
