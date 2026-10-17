import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { Request } from 'express'
import { TenantSetting } from './tenant-setting.entity'
import { TenantSettingService } from './tenant-setting.service'

@Injectable()
export class TenantSettingMutationGuard implements CanActivate {
	constructor(private readonly settings: TenantSettingService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request<{ id?: string }, unknown, Partial<TenantSetting>>>()
		if (!request.params.id || !['PUT', 'DELETE', 'PATCH'].includes(request.method)) return true

		// Inherited CRUD routes must not bypass the key/value settings endpoint's retention authorization.
		const setting = await this.settings.findOneByIdString(request.params.id)
		const tenantId = RequestContext.currentTenantId()
		this.settings.assertRetentionSettingsAccess([setting.name, request.body?.name].filter(Boolean), tenantId)
		if (
			(request.body?.tenantId && request.body.tenantId !== tenantId) ||
			(request.body?.tenant && request.body.tenant.id !== tenantId)
		) {
			throw new ForbiddenException(
				t('server-ai:Error.TenantSettingScopeImmutable', {
					defaultValue: 'A setting cannot be moved to another tenant.'
				})
			)
		}
		return true
	}
}
