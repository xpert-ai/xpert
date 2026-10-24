import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import * as jwt from 'jsonwebtoken'
import { t } from 'i18next'
import { Request, Response, NextFunction } from 'express'
import { Cache } from 'cache-manager'
import { TenantSettingService } from './tenant-setting.service'
import { TenantSettingsCache } from './tenant-settings-cache'

type TenantSettings = Awaited<ReturnType<TenantSettingService['getSettings']>>

@Injectable()
export class TenantSettingsMiddleware implements NestMiddleware {
	private readonly logger = new Logger(TenantSettingsMiddleware.name)
	private readonly cache = new TenantSettingsCache()

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(TenantSettingService) private readonly tenantSettingService: TenantSettingService
	) {}

	async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
		const path = (request.originalUrl || request.url).split('?')[0]
		// Readiness is an in-memory admission snapshot, including when callers send credentials.
		if (['GET', 'HEAD'].includes(request.method) && /^\/(?:api\/)?health\/ready\/?$/.test(path)) {
			next()
			return
		}

		try {
			const token = request.headers.authorization?.split(' ')[1]
			const decoded = token ? jwt.decode(token) : null
			if (decoded && typeof decoded === 'object' && typeof decoded.tenantId === 'string' && decoded.tenantId) {
				const tenantId = decoded.tenantId
				const cacheKey = `tenantSettings_${tenantId}`
				let settings = await this.cache.run(() => this.cacheManager.get<TenantSettings>(cacheKey))
				if (!settings) {
					settings = await this.tenantSettingService.getSettings({ where: { tenantId } })
					if (settings) {
						const value = settings
						await this.cache.run(() => this.cacheManager.set(cacheKey, value, 5 * 60 * 1000))
					}
				}
				if (settings) request['tenantSettings'] = settings
			}
		} catch {
			// Do not log settings, decoded tokens or arbitrary cache/database error payloads.
			this.logger.warn(
				t('server-ai:Error.TenantSettingsLookupFailed', { defaultValue: 'Tenant settings lookup failed' })
			)
		}
		// Settings enrichment never authenticates a request; the normal guards still run.
		next()
	}
}
