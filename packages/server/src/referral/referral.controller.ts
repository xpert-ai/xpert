import {
	IReferralCodeView,
	IReferralRelationQuery,
	IReferralRelationView,
	IPagination,
	PermissionsEnum,
	RolesEnum
} from '@xpert-ai/contracts'
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { RequestContext } from '../core/context'
import { Permissions, Public, Roles } from '../shared/decorators'
import { PermissionGuard, RoleGuard, TenantPermissionGuard } from '../shared/guards'
import { ReferralService } from './referral.service'
import { ReferralValidationRateLimitService } from './referral-validation-rate-limit.service'

@Controller('referral')
export class ReferralController {
	constructor(
		private readonly referralService: ReferralService,
		private readonly validationRateLimitService: ReferralValidationRateLimitService
	) {}

	@Public()
	@Get('availability')
	async getAvailability() {
		const tenantId = this.getRequestTenantId()
		return tenantId ? this.referralService.isFeatureEnabled(tenantId) : false
	}

	@Public()
	@Get('validate')
	async validate(@Query('code') code: string | undefined, @Req() request: Request) {
		const tenantId = this.getRequestTenantId()
		if (!tenantId) {
			return false
		}
		await this.validationRateLimitService.assertAllowed(
			tenantId,
			request.ips?.[0] || request.ip || request.socket.remoteAddress || 'anonymous'
		)
		return this.referralService.validatePublicCode(tenantId, code)
	}

	@Get('me')
	async getMyCode(): Promise<IReferralCodeView> {
		return this.referralService.getMyCode()
	}

	@UseGuards(TenantPermissionGuard, RoleGuard, PermissionGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	@Permissions(PermissionsEnum.REFERRAL_VIEW)
	@Get('relations')
	async getRelations(@Query() query: IReferralRelationQuery): Promise<IPagination<IReferralRelationView>> {
		return this.referralService.getRelations({
			search: query.search,
			skip: this.toNumber(query.skip),
			take: this.toNumber(query.take)
		})
	}

	private getRequestTenantId() {
		return RequestContext.getScope().tenantId
	}

	private toNumber(value?: number | string) {
		if (typeof value === 'number') {
			return Number.isFinite(value) ? value : undefined
		}
		if (typeof value !== 'string' || !value.trim()) {
			return undefined
		}
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}
}
