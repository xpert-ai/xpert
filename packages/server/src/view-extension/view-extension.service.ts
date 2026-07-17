import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ViewExtensionProviderRegistry } from '@xpert-ai/plugin-sdk'
import {
	XpertExtensionViewManifest,
	XpertRemoteComponentEntry,
	XpertResolvedViewHostContext,
	XpertViewActionRequest,
	XpertViewActionResult,
	XpertViewDataResult,
	XpertViewFileAccessPurpose,
	XpertViewFileAccessRequest,
	XpertViewParameterOptionsQuery,
	XpertViewParameterOptionsResult,
	XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewHostDefinitionRegistry } from './host-definition.registry'
import { ViewExtensionFileActionFile } from './host-definition.interface'
import { ViewExtensionPermissionService } from './view-extension.permission.service'
import { ViewExtensionCacheService } from './view-extension.cache.service'
import {
	buildBaseViewHostContext,
	isSupportedRemoteComponentRuntime,
	isManifestActiveForContext,
	normalizeManifest,
	splitPublicViewKey,
	validateQuery
} from './view-extension.utils'

@Injectable()
export class ViewExtensionService {
	private readonly logger = new Logger(ViewExtensionService.name)

	constructor(
		private readonly providerRegistry: ViewExtensionProviderRegistry,
		private readonly hostDefinitionRegistry: ViewHostDefinitionRegistry,
		private readonly permissionService: ViewExtensionPermissionService,
		private readonly cacheService: ViewExtensionCacheService
	) {}

	async listSlotViews(hostType: string, hostId: string, slot: string) {
		const context = await this.resolveHostContext(hostType, hostId)
		this.ensureSlotExists(context, slot)

		return this.cacheService.getOrSetSlotViews(context, slot, 60 * 1000, async () => {
			const manifests: XpertExtensionViewManifest[] = []

			for (const { providerKey, provider } of this.providerRegistry.listEntries(context.organizationId)) {
				try {
					if (!(await provider.supports(context))) {
						continue
					}

					const providerManifests = await provider.getViewManifests(context, slot)
					manifests.push(
						...providerManifests
							.map((manifest) => normalizeManifest(manifest, providerKey, context, slot))
							.filter((manifest) => isManifestActiveForContext(manifest, context))
					)
				} catch (error) {
					this.logger.warn(
						`Failed to load view manifests for provider '${providerKey}': ${error instanceof Error ? error.message : String(error)}`
					)
				}
			}

			return this.permissionService
				.filterVisibleManifests(manifests)
				.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
		})
	}

	async getViewData(hostType: string, hostId: string, viewKey: string, query: XpertViewQuery) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)
		validateQuery(query, resolved.manifest.dataSource)

		const cacheEnabled = resolved.manifest.dataSource.cache?.enabled !== false
		const ttlMs = Math.min(resolved.manifest.dataSource.cache?.ttlMs ?? 30 * 1000, 30 * 1000)

		if (!cacheEnabled) {
			return resolved.provider.getViewData(context, resolved.manifestKey, query)
		}

		return this.cacheService.getOrSetViewData(context, viewKey, query, ttlMs, () =>
			Promise.resolve(resolved.provider.getViewData(context, resolved.manifestKey, query))
		)
	}

	async getViewManifest(hostType: string, hostId: string, viewKey: string) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)

		return resolved.manifest
	}

	async getRemoteComponentEntry(
		hostType: string,
		hostId: string,
		viewKey: string
	): Promise<XpertRemoteComponentEntry> {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)

		const view = resolved.manifest.view
		if (view.type !== 'remote_component') {
			throw new BadRequestException(`View '${viewKey}' is not a remote component view`)
		}
		if (!isSupportedRemoteComponentRuntime(view.runtime) || view.protocolVersion !== 1) {
			throw new BadRequestException(`View '${viewKey}' uses an unsupported remote component runtime`)
		}
		if (view.component.isolation !== 'iframe') {
			throw new BadRequestException(`Remote component view '${viewKey}' must use iframe isolation`)
		}
		this.validateRemoteComponentEntryKey(view.component.entry)

		if (!resolved.provider.getRemoteComponentEntry) {
			throw new NotFoundException(`Remote component entry is not supported for view '${viewKey}'`)
		}

		const entry = await Promise.resolve(
			resolved.provider.getRemoteComponentEntry(context, resolved.manifestKey, view.component)
		)

		if (!entry?.html || typeof entry.html !== 'string') {
			throw new BadRequestException(`Remote component entry for view '${viewKey}' is empty`)
		}

		return {
			html: entry.html,
			contentType: entry.contentType ?? 'text/html; charset=utf-8'
		}
	}

	async getViewParameterOptions(
		hostType: string,
		hostId: string,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)

		if (!resolved.manifest.parameters?.some((item) => item.key === parameterKey)) {
			throw new NotFoundException(`Parameter '${parameterKey}' was not found for view '${viewKey}'`)
		}

		if (!resolved.provider.getViewParameterOptions) {
			return { items: [] }
		}

		return Promise.resolve(
			resolved.provider.getViewParameterOptions(context, resolved.manifestKey, parameterKey, query)
		)
	}

	async executeAction(
		hostType: string,
		hostId: string,
		viewKey: string,
		actionKey: string,
		request: XpertViewActionRequest
	) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)

		const action = resolved.manifest.actions?.find((item) => item.key === actionKey)
		if (!action) {
			throw new NotFoundException(`Action '${actionKey}' was not found for view '${viewKey}'`)
		}
		this.permissionService.ensureActionVisible(action)

		if ((action.transport ?? 'json') !== 'json') {
			throw new BadRequestException(`Action '${actionKey}' does not support JSON transport`)
		}

		if (!resolved.provider.executeViewAction) {
			throw new NotFoundException(`Action '${actionKey}' is not supported for view '${viewKey}'`)
		}

		const result = await Promise.resolve(
			resolved.provider.executeViewAction(context, resolved.manifestKey, actionKey, request)
		)

		if (result.refresh) {
			await this.cacheService.invalidateView(context, viewKey)
		}

		return result
	}

	async executeFileAction(
		hostType: string,
		hostId: string,
		viewKey: string,
		actionKey: string,
		request: XpertViewActionRequest,
		file: ViewExtensionFileActionFile
	) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)

		const action = resolved.manifest.actions?.find((item) => item.key === actionKey)
		if (!action) {
			throw new NotFoundException(`Action '${actionKey}' was not found for view '${viewKey}'`)
		}
		this.permissionService.ensureActionVisible(action)

		if ((action.transport ?? 'json') !== 'file') {
			throw new BadRequestException(`Action '${actionKey}' does not support file transport`)
		}

		if (!resolved.provider.executeViewFileAction) {
			throw new NotFoundException(`File action '${actionKey}' is not supported for view '${viewKey}'`)
		}

		const hostDefinition = this.hostDefinitionRegistry.get(hostType)
		const preparedRequest = hostDefinition?.prepareFileAction
			? await Promise.resolve(hostDefinition.prepareFileAction(context, request, file))
			: request

		const result = await Promise.resolve(
			resolved.provider.executeViewFileAction(context, resolved.manifestKey, actionKey, preparedRequest, file)
		)

		if (result.refresh) {
			await this.cacheService.invalidateView(context, viewKey)
		}

		return result
	}

	async resolveViewFileAccessContext(hostType: string, hostId: string, viewKey: string) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)
		if (!resolved.manifest.fileAccess?.purposes.length) {
			throw new NotFoundException(`File access is not available for view '${viewKey}'`)
		}

		return {
			context,
			manifest: resolved.manifest
		}
	}

	async resolveViewFileResource(
		hostType: string,
		hostId: string,
		viewKey: string,
		request: XpertViewFileAccessRequest
	) {
		const context = await this.resolveHostContext(hostType, hostId)
		const resolved = await this.resolveProviderManifest(context, viewKey)

		this.permissionService.ensureManifestVisible(resolved.manifest)
		this.ensureFileAccessPurpose(resolved.manifest.fileAccess?.purposes, request.purpose, viewKey)
		if (!resolved.provider.resolveViewFile) {
			throw new NotFoundException(`File access is not supported for view '${viewKey}'`)
		}

		const resource = await Promise.resolve(
			resolved.provider.resolveViewFile(context, resolved.manifestKey, request)
		)
		if (!resource?.reference || !resource.fileName?.trim() || !resource.mimeType?.trim()) {
			throw new BadRequestException(`View '${viewKey}' returned an invalid file resource`)
		}

		return { context, manifest: resolved.manifest, resource }
	}

	private ensureFileAccessPurpose(
		purposes: XpertViewFileAccessPurpose[] | undefined,
		purpose: XpertViewFileAccessPurpose,
		viewKey: string
	) {
		if (!purposes?.includes(purpose)) {
			throw new NotFoundException(`File access purpose '${purpose}' is not available for view '${viewKey}'`)
		}
	}

	private async resolveProviderManifest(context: XpertResolvedViewHostContext, publicViewKey: string) {
		const { providerKey, manifestKey } = splitPublicViewKey(publicViewKey)
		let provider = null
		try {
			provider = this.providerRegistry.get(providerKey, context.organizationId ?? undefined)
		} catch {
			throw new NotFoundException(`View provider '${providerKey}' was not found`)
		}

		if (!(await provider.supports(context))) {
			throw new NotFoundException(`View provider '${providerKey}' does not support this host`)
		}

		for (const slot of context.slots) {
			const manifests = await Promise.resolve(provider.getViewManifests(context, slot.key))
			for (const manifest of manifests) {
				if (manifest.key !== manifestKey) {
					continue
				}

				const normalized = normalizeManifest(manifest, providerKey, context, slot.key)
				if (!isManifestActiveForContext(normalized, context)) {
					throw new NotFoundException(`View '${publicViewKey}' was not found`)
				}

				return {
					provider,
					manifestKey,
					manifest: normalized
				}
			}
		}

		throw new NotFoundException(`View '${publicViewKey}' was not found`)
	}

	private async resolveHostContext(hostType: string, hostId: string) {
		const definition = this.hostDefinitionRegistry.get(hostType)
		if (!definition) {
			throw new NotFoundException(`Unknown view host '${hostType}'`)
		}

		const baseContext = buildBaseViewHostContext(hostType, hostId)
		const resolution = await Promise.resolve(definition.resolve(hostId))

		if (!resolution) {
			throw new NotFoundException(`View host '${hostType}:${hostId}' was not found`)
		}

		await this.permissionService.assertHostReadable(definition, baseContext, resolution)

		const contextExtension = isRecord(resolution.context) ? resolution.context : {}

		return {
			...contextExtension,
			...baseContext,
			workspaceId: resolution.workspaceId ?? null,
			hostSnapshot: resolution.hostSnapshot,
			slots: [...definition.slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		}
	}

	private ensureSlotExists(context: XpertResolvedViewHostContext, slot: string) {
		if (!context.slots.some((item) => item.key === slot)) {
			throw new NotFoundException(`Slot '${slot}' is not available for host '${context.hostType}'`)
		}
	}

	private validateRemoteComponentEntryKey(entry: string) {
		const normalized = entry?.trim()
		if (!normalized) {
			throw new BadRequestException('Remote component entry is required')
		}
		if (
			normalized.startsWith('/') ||
			normalized.startsWith('//') ||
			normalized.includes('\\') ||
			normalized.split('/').includes('..') ||
			!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized) ||
			/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalized)
		) {
			throw new BadRequestException(`Invalid remote component entry '${entry}'`)
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
