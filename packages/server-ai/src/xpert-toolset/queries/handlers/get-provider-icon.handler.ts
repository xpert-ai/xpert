import { ConfigService } from '@xpert-ai/server-config'
import { IconDefinition } from '@xpert-ai/contracts'
import { HttpException, HttpStatus, Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AgentMiddlewareRegistry, RequestContext, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { existsSync, readFileSync } from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import { ToolProviderNotFoundError } from '../../errors'
import { getBuiltinToolsetBaseUrl } from '../../provider/builtin'
import { TToolsetProviderSchema } from '../../types'
import { ToolProviderIconQuery } from '../get-provider-icon.query'
import { ListBuiltinToolProvidersQuery } from '../list-builtin-providers.query'

type ProviderIcon = IconDefinition | null | undefined

@QueryHandler(ToolProviderIconQuery)
export class ToolProviderIconHandler implements IQueryHandler<ToolProviderIconQuery> {
	protected logger = new Logger(ToolProviderIconHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	@Inject(ToolsetRegistry)
	protected readonly toolsetRegistry: ToolsetRegistry

	@Inject(AgentMiddlewareRegistry)
	private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: ToolProviderIconQuery): Promise<[Buffer, string]> {
		const { provider, organizationId } = command.options
		
		// Try to get organizationId from request context
		const requestOrgId = RequestContext.getOrganizationId()
		const resolvedOrganizationId = organizationId ?? requestOrgId

		// Step 1: Try to get from plugin registry (npm installed plugins)
		try {
			const pluginProvider = this.toolsetRegistry.get(provider, resolvedOrganizationId)
			if (pluginProvider) {
				const resolved = this.resolveIcon(pluginProvider.meta.icon)
				if (resolved) {
					return resolved
				}

				return [null, null]
			}
		} catch (err) {
			// If not found in plugin registry, continue to try builtin providers
		}

		// Step 2: Try to get from builtin providers
		const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
			new ListBuiltinToolProvidersQuery([provider])
		)
		
		if (providers[0]) {
			const filePath = path.join(this.getProviderServerPath(provider), '_assets', providers[0].identity.icon)

			if (!existsSync(filePath)) {
				return [null, null]
			}

			const mimeType = mime.lookup(filePath) || 'application/octet-stream'
			const byteData = readFileSync(filePath)
			return [byteData, mimeType]
		}

		// Step 3: Try to get from middleware
		try {
			const middleware = this.agentMiddlewareRegistry.get(provider, resolvedOrganizationId)
			if (middleware?.meta?.icon) {
				const resolved = this.resolveIcon(middleware.meta.icon)
				if (resolved) {
					return resolved
				}
			}
		} catch (err) {
			//
		}

		// All steps failed
		throw new ToolProviderNotFoundError(`Not found tool provider '${provider}'`)
	}

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}

	private resolveIcon(icon: ProviderIcon | unknown): [Buffer, string] | null {
		if (!isObjectValue(icon)) {
			return null
		}

		const type = getNonEmptyString(icon, 'type')
		const value = getNonEmptyString(icon, 'value')

		// Standard IconDefinition shape.
		if (type === 'svg' && value) {
			return [Buffer.from(value, 'utf-8'), 'image/svg+xml']
		}
		if (type === 'image' && value) {
			return this.decodeBase64Image(value)
		}

		// Backward compatibility for older plugin builds that used { svg, color }.
		const legacySvg = getNonEmptyString(icon, 'svg')
		if (legacySvg) {
			return [Buffer.from(legacySvg, 'utf-8'), 'image/svg+xml']
		}

		const legacyImage = getNonEmptyString(icon, 'image')
		if (legacyImage) {
			return this.decodeBase64Image(legacyImage)
		}

		throw new HttpException(
			'Icon format not supported:' + (type ?? getNonEmptyString(icon, 'svg') ?? 'unknown'),
			HttpStatus.UNSUPPORTED_MEDIA_TYPE
		)
	}

	private decodeBase64Image(value: string): [Buffer, string] {
		const normalizedValue = value.trim()
		const dataUrlMatch = normalizedValue.match(/^(?:data:)?(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i)

		const mimeType = dataUrlMatch?.[1] ?? 'image/png'
		const base64 = (dataUrlMatch?.[2] ?? normalizedValue).replace(/\s/g, '')
		const byteData = Buffer.from(base64, 'base64')

		return [byteData, mimeType]
	}
}

function isObjectValue(value: unknown): value is object {
	return typeof value === 'object' && value !== null
}

function getNonEmptyString(value: object, key: string): string | null {
	const candidate = Reflect.get(value, key)
	if (typeof candidate !== 'string') {
		return null
	}

	const normalized = candidate.trim()
	return normalized ? normalized : null
}
