import { NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DEFAULT_TENANT } from '@xpert-ai/contracts'
import type { IAuthResponse, IUserLoginInput } from '@xpert-ai/contracts'
import bcrypt from 'bcryptjs'
import type { FindOneOptions } from 'typeorm'
import { getFirstHeaderValue, RequestContext } from '../../../core/context'
import { TenantService } from '../../../tenant/tenant.service'
import type { User } from '../../../user/user.entity'
import { UserService } from '../../../user/user.service'
import { AuthService } from '../../auth.service'
import { AuthLoginCommand } from '../auth.login.command'

@CommandHandler(AuthLoginCommand)
export class AuthLoginHandler implements ICommandHandler<AuthLoginCommand, IAuthResponse | null> {
	constructor(
		private readonly authService: AuthService,
		private readonly userService: UserService,
		private readonly tenantService: TenantService
	) {}

	public async execute(command: AuthLoginCommand): Promise<IAuthResponse | null> {
		const { input } = command
		const { email, password }: IUserLoginInput = input
		const normalizedIdentifier = email.trim().toLowerCase()
		const tenantId = this.getLoginTenantId()
		const tenantFilter = tenantId ? { tenantId } : {}

		let user = await this.findLoginUser(normalizedIdentifier, tenantFilter)

		if (!user && tenantId && (await this.isDefaultTenantId(tenantId))) {
			user = await this.findLoginUser(normalizedIdentifier)
		}

		if (!user?.hash || !(await bcrypt.compare(password, user.hash))) {
			return null
		}

		const { token, refreshToken } = await this.authService.createToken(user)

		await this.authService.updateRefreshToken(user.id, refreshToken)

		return {
			user,
			token,
			refreshToken
		}
	}

	private getLoginTenantId(): string | null {
		const request = RequestContext.currentRequest()
		return getFirstHeaderValue(request?.headers?.['tenant-id']) ?? null
	}

	private async findLoginUser(
		normalizedIdentifier: string,
		tenantFilter: { tenantId?: string } = {}
	): Promise<User | null> {
		try {
			return await this.userService.findOneByOptions(
				this.buildLoginUserOptions(normalizedIdentifier, tenantFilter)
			)
		} catch (error) {
			if (this.isNotFound(error)) {
				return null
			}

			throw error
		}
	}

	private buildLoginUserOptions(
		normalizedIdentifier: string,
		tenantFilter: { tenantId?: string }
	): FindOneOptions<User> {
		return {
			where: [
				{ email: normalizedIdentifier, emailVerified: true, ...tenantFilter },
				{ username: normalizedIdentifier, ...tenantFilter }
			],
			relations: ['role', 'role.rolePermissions', 'employee'],
			order: {
				createdAt: 'DESC'
			}
		}
	}

	private async isDefaultTenantId(tenantId: string): Promise<boolean> {
		const result = await this.tenantService.findOneOrFailByOptions({
			select: ['id'],
			where: {
				name: DEFAULT_TENANT
			}
		})

		return result.success && result.record?.id === tenantId
	}

	private isNotFound(error: unknown) {
		return (
			error instanceof NotFoundException ||
			(typeof error === 'object' &&
				error !== null &&
				('status' in error || 'getStatus' in error) &&
				((error as { status?: number }).status === 404 ||
					(error as { getStatus?: () => number }).getStatus?.() === 404))
		)
	}
}
