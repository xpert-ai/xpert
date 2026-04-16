import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, InsertResult, Like, Brackets, WhereExpressionBuilder, In, FindOneOptions, DeleteResult } from 'typeorm'
import bcrypt from 'bcryptjs'
import { environment as env } from '@xpert-ai/server-config'
import { nanoid } from 'nanoid'
import { User } from './user.entity'
import { TenantAwareCrudService } from './../core/crud'
import { ID, IUser, LanguagesEnum, PermissionsEnum, RolesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { EmailVerification } from './email-verification/email-verification.entity'
import { UserPublicDTO } from './dto'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { EVENT_USER_ORGANIZATION_DELETED, UserOrganizationDeletedEvent } from './events'

const REQUEST_CONTEXT_USER_RELATIONS = ['role', 'role.rolePermissions', 'employee'] as const
const CURRENT_USER_CORE_RELATIONS = ['employee', 'role', 'role.rolePermissions', 'tenant'] as const
const AUTHENTICATED_USER_RELATIONS = ['role', 'employee'] as const

function resolveCurrentUserRelations(relations?: string[]) {
	return Array.from(new Set([...CURRENT_USER_CORE_RELATIONS, ...(relations ?? [])]))
}

function normalizeEmail(email?: string | null) {
	return email?.trim().toLowerCase() || null
}

function normalizeUsername(username?: string | null) {
	return username?.trim().toLowerCase() || null
}

@Injectable()
export class UserService extends TenantAwareCrudService<User> {
	constructor(
		@InjectRepository(User)
		userRepository: Repository<User>,
		@InjectRepository(EmailVerification)
		public emailVerificationRepository: Repository<EmailVerification>,
		@Inject(forwardRef(() => UserOrganizationService))
		private readonly userOrganizationService: UserOrganizationService,
		private readonly eventEmitter: EventEmitter2
	) {
		super(userRepository)
	}

	async findCurrentUser(id: string, relations?: string[]): Promise<User> {
		return this.findOne(id, {
			relations: resolveCurrentUserRelations(relations)
		})
	}

	async getUserByEmail(email: string): Promise<User> {
		const normalizedEmail = normalizeEmail(email)
		const user = await this.repository
			.createQueryBuilder('user')
			.where('user.email = :email', { email: normalizedEmail })
			.getOne()
		return user
	}

	async getUserIdByEmail(email: string): Promise<string> {
		const user = await this.getUserByEmail(email)
		const userId = user.id
		return userId
	}

	async getIfExistsUser(user: IUser): Promise<IUser> {
		let _user: IUser = null
		const normalizedEmail = normalizeEmail(user.email)
		const normalizedUsername = normalizeUsername(user.username)

		if (normalizedEmail) {
			const userExists = await this.findOneOrFailByOptions({ where: { email: normalizedEmail } })
			if (userExists.success) {
				_user = userExists.record
			}
		}

		if (!_user && user.mobile) {
			const userExists = await this.findOneOrFailByOptions({ where: { mobile: user.mobile } })
			if (userExists.success) {
				_user = userExists.record
			}
		}
		if (!_user && user.thirdPartyId) {
			const userExists = await this.findOneOrFailByOptions({ where: { thirdPartyId: user.thirdPartyId } })
			if (userExists.success) {
				_user = userExists.record
			}
		}
		if (!_user && normalizedUsername) {
			const userExists = await this.findOneOrFailByOptions({ where: { username: normalizedUsername } })
			if (userExists.success) {
				_user = userExists.record
			}
		}

		return _user
	}

	async checkIfExistsEmail(email: string): Promise<boolean> {
		const normalizedEmail = normalizeEmail(email)
		const count = await this.repository
			.createQueryBuilder('user')
			.where('user.email = :email', { email: normalizedEmail })
			.getCount()
		return count > 0
	}

	async checkIfExists(id: string): Promise<boolean> {
		const count = await this.repository.createQueryBuilder('user').where('user.id = :id', { id }).getCount()
		return count > 0
	}

	async checkIfExistsThirdParty(thirdPartyId: string): Promise<boolean> {
		const count = await this.repository
			.createQueryBuilder('user')
			.where('user.thirdPartyId = :thirdPartyId', { thirdPartyId })
			.getCount()
		return count > 0
	}

	async getIfExists(id: string): Promise<User> {
		return this.findOne(id, {
			relations: [...AUTHENTICATED_USER_RELATIONS]
		})
	}

	async findOneByIdWithinTenant(id: string, tenantId: string, options?: Omit<FindOneOptions<User>, 'where'>) {
		const entity = await this.repository.findOne({
			...(options ?? {}),
			where: {
				id,
				tenantId
			}
		})

		if (!entity) {
			throw new NotFoundException(`The user '${id}' was not found in current tenant`)
		}

		return entity
	}

	async findOneByThirdPartyIdWithinTenant(
		thirdPartyId: string,
		tenantId: string,
		options?: Omit<FindOneOptions<User>, 'where'>
	) {
		const entity = await this.repository.findOne({
			...(options ?? {}),
			where: {
				thirdPartyId,
				tenantId
			}
		})

		if (!entity) {
			throw new NotFoundException(`The user '${thirdPartyId}' was not found in current tenant`)
		}

		return entity
	}

	async ensureCommunicationUser(input: {
		tenantId: string
		thirdPartyId: string
		username?: string | null
		imageUrl?: string | null
		preferredLanguage?: LanguagesEnum
	}) {
		const existing = await this.repository.findOne({
			where: {
				tenantId: input.tenantId,
				thirdPartyId: input.thirdPartyId
			},
			relations: [...REQUEST_CONTEXT_USER_RELATIONS]
		})

		if (existing) {
			return existing
		}

		const created = await this.repository.save(
			this.repository.create({
				tenant: { id: input.tenantId } as any,
				tenantId: input.tenantId,
				thirdPartyId: input.thirdPartyId,
				username: buildTechnicalUsername(input.username ?? input.thirdPartyId),
				imageUrl: input.imageUrl ?? undefined,
				type: UserType.COMMUNICATION,
				preferredLanguage: input.preferredLanguage ?? LanguagesEnum.English,
				emailVerified: true,
				hash: await this.getPasswordHash(nanoid(32))
			})
		)

		return this.findOneByIdWithinTenant(created.id, input.tenantId, {
			relations: [...REQUEST_CONTEXT_USER_RELATIONS]
		})
	}

	async getIfExistsThirdParty(thirdPartyId: string): Promise<User> {
		return await this.repository
			.createQueryBuilder('user')
			.where('user.thirdPartyId = :thirdPartyId', { thirdPartyId })
			.leftJoinAndSelect('user.role', 'role')
			.leftJoinAndSelect('user.employee', 'employee')
			.getOne()
	}

	async createOne(user: User): Promise<InsertResult> {
		return await this.repository.insert(user)
	}

	async changePassword(id: string, hash: string) {
		const user = await this.findOne(id)
		user.hash = hash
		return await this.repository.save(user)
	}

	async resetPassword(id: string, hash: string, password: string) {
		const user = await this.findOne(id, { relations: ['role'] })
		if (!user) {
			throw new NotFoundException(`The user was not found`)
		}

		const isSelf = RequestContext.currentUserId() === id
		const canManageUsers = RequestContext.hasAnyPermission([
			PermissionsEnum.ALL_ORG_EDIT,
			PermissionsEnum.SUPER_ADMIN_EDIT
		])

		if (!isSelf && !canManageUsers) {
			throw new ForbiddenException()
		}

		if (isSelf) {
			if (!hash || (user.hash && !(await bcrypt.compare(hash, user.hash)))) {
				throw new ForbiddenException(`Current password not match`)
			}
		}

		user.hash = await this.getPasswordHash(password)

		return await this.repository.save(user)
	}

	async isActiveMemberOfOrganization(userId: string, organizationId: string) {
		const tenantId = RequestContext.currentTenantId()

		const total = await this.repository
			.createQueryBuilder('user')
			.innerJoin(
				'user.organizations',
				'userOrganization',
				'userOrganization.organizationId = :organizationId AND userOrganization.isActive = :isActive',
				{
					organizationId,
					isActive: true
				}
			)
			.where('user.id = :userId', { userId })
			.andWhere('user.tenantId = :tenantId', { tenantId })
			.getCount()

		return total > 0
	}

	/**
	 * Updates the profile of a user.
	 * Ensures the user has the necessary permissions and applies restrictions to role updates.
	 *
	 * @param id - The ID of the user to update.
	 * @param entity - The user entity with updated data.
	 * @returns The updated user entity.
	 * @throws ForbiddenException if the user lacks the required permissions or attempts unauthorized updates.
	 */
	async updateProfile(id: ID | number, entity: User): Promise<IUser> {
		const currentRoleId = RequestContext.currentRoleId()
		const currentUserId = RequestContext.currentUserId()
		const isSelf = currentUserId === id
		const canManageUsers = RequestContext.hasAnyPermission([
			PermissionsEnum.ALL_ORG_EDIT,
			PermissionsEnum.SUPER_ADMIN_EDIT
		])

		if (!isSelf && !canManageUsers) {
			throw new ForbiddenException()
		}

		let user: IUser | null = null

		if (typeof id == 'string') {
			user = await this.findOneByIdString(id, { relations: { role: true } })
		}

		if (!user) {
			throw new NotFoundException(`The user '${id}' was not found`)
		}

		if (user.role?.name === RolesEnum.SUPER_ADMIN) {
			if (!RequestContext.hasPermission(PermissionsEnum.SUPER_ADMIN_EDIT)) {
				throw new ForbiddenException()
			}
		}

		if (isSelf && entity.role && entity.role.id !== currentRoleId) {
			throw new ForbiddenException()
		}

		if (entity['hash']) {
			entity['hash'] = await this.getPasswordHash(entity['hash'])
		}

		await this.save(entity)

		return await this.findOneByWhereOptions({
			id: id as string,
			tenantId: RequestContext.currentTenantId()
		})
	}

	private async ensureDeleteWithGuards(id: string) {
		const currentUserId = RequestContext.currentUserId()
		if (currentUserId === id) {
			throw new BadRequestException('You cannot delete your own user account.')
		}

		const tenantId = RequestContext.currentTenantId()
		const user = await this.findOneByIdWithinTenant(id, tenantId, {
			relations: ['role']
		})

		if (!user.role?.name) {
			throw new BadRequestException('The user role is required before deleting the user.')
		}

		if (
			user.role.name === RolesEnum.SUPER_ADMIN &&
			!RequestContext.hasPermission(PermissionsEnum.SUPER_ADMIN_EDIT)
		) {
			throw new ForbiddenException()
		}

		if ([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN].includes(user.role.name as RolesEnum)) {
			const remainingAdministrators = await this.repository
				.createQueryBuilder('user')
				.innerJoin('user.role', 'role')
				.where('user.tenantId = :tenantId', { tenantId })
				.andWhere('user.id != :userId', { userId: user.id })
				.andWhere('role.name IN (:...roleNames)', {
					roleNames: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
				})
				.getCount()

			if (!remainingAdministrators) {
				throw new BadRequestException('Cannot delete the last tenant administrator.')
			}
		}

		return { tenantId, user }
	}

	private async deleteUserOrganizations(userId: string, tenantId: string) {
		const { items: memberships } = await this.userOrganizationService.findAll({
			where: {
				userId,
				tenantId
			}
		})

		for (const membership of memberships) {
			await this.userOrganizationService.delete(membership.id, {
				allowDeletingLastMembership: true
			})

			this.eventEmitter.emit(
				EVENT_USER_ORGANIZATION_DELETED,
				new UserOrganizationDeletedEvent(membership.tenantId, membership.organizationId, membership.userId)
			)
		}
	}

	async deleteWithGuards(id: string) {
		const { tenantId } = await this.ensureDeleteWithGuards(id)
		await this.deleteUserOrganizations(id, tenantId)

		return this.softDelete(id)
	}

	async deleteHardWithGuards(id: string): Promise<DeleteResult> {
		await this.ensureDeleteWithGuards(id)

		return this.delete(id)
	}

	async getAdminUsers(tenantId: string): Promise<User[]> {
		return await this.repository.find({
			join: {
				alias: 'user',
				leftJoin: {
					role: 'user.role'
				}
			},
			where: {
				tenantId,
				role: {
					name: In([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])
				}
			}
		})
	}

	/*
	 * Update user preferred language
	 */
	async updatePreferredLanguage(id: string | number, preferredLanguage: LanguagesEnum): Promise<IUser> {
		try {
			const user = await this.findOne(id)
			if (!user) {
				throw new NotFoundException(`The user was not found`)
			}
			user.preferredLanguage = preferredLanguage
			return await this.repository.save(user)
		} catch (err) {
			throw new NotFoundException(`The record was not found`, err)
		}
	}

	async verifyEmail(token: string): Promise<void> {
		const emailVerification = await this.emailVerificationRepository.findOne({
			where: { token },
			relations: ['user']
		})

		if (emailVerification !== null && emailVerification.validUntil > new Date()) {
			await this.update(emailVerification.userId, { emailVerified: true })
		} else {
			Logger.log(`Verify email called with invalid email token ${token}`)
			throw new NotFoundException()
		}
	}

	async deleteEmailVarification(id: string) {
		this.emailVerificationRepository.delete(id)
	}

	async search(text: string, organizationId?: string, membership?: string) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()
		const sanitizedText = text?.trim().split('%').join('') ?? ''
		const condition = Like(`%${sanitizedText}%`)

		if (RequestContext.hasRole(RolesEnum.TRIAL)) {
			return this.findAll({ where: { id: userId } }).then((result) => ({
				...result,
				items: result.items.map((item) => new UserPublicDTO(item))
			}))
		} else if (organizationId && membership === 'non-members') {
			const query = this.repository
				.createQueryBuilder('user')
				.leftJoin(
					'user.organizations',
					'organizationMembership',
					'organizationMembership.organizationId = :organizationId',
					{
						organizationId
					}
				)
				.where(
					new Brackets((qb: WhereExpressionBuilder) => {
						qb.orWhere('user.email LIKE :searchText')
						qb.orWhere('user.username LIKE :searchText')
						qb.orWhere('user.firstName LIKE :searchText')
						qb.orWhere('user.lastName LIKE :searchText')
					}),
					{ searchText: `%${sanitizedText}%` }
				)
				.andWhere('user.tenantId = :tenantId', { tenantId })
				.andWhere('organizationMembership.id IS NULL')
				.take(20)

			return query.getManyAndCount().then(([items, total]) => ({
				total,
				items: items.map((item) => new UserPublicDTO(item))
			}))
		} else if (organizationId) {
			const query = this.repository
				.createQueryBuilder('user')
				.leftJoinAndSelect('user.organizations', 'organizations')
				.leftJoinAndSelect('organizations.organization', 'organization')
				.where(
					new Brackets((qb: WhereExpressionBuilder) => {
						qb.orWhere('user.email LIKE :searchText')
						qb.orWhere('user.username LIKE :searchText')
						qb.orWhere('user.firstName LIKE :searchText')
						qb.orWhere('user.lastName LIKE :searchText')
					}),
					{ searchText: `%${text.split('%').join('')}%` }
				)
				.andWhere('user.tenantId = :tenantId', { tenantId })
				.andWhere('organization.id = :organizationId', { organizationId })

			return query.getManyAndCount().then(([items, total]) => ({
				total,
				items: items.map((item) => new UserPublicDTO(item))
			}))
		}

		const where: any[] = [
			{
				email: condition
			},
			{
				firstName: condition
			},
			{
				lastName: condition
			}
		]
		return this.findAll({ where }).then((result) => ({
			...result,
			items: result.items.map((item) => new UserPublicDTO(item))
		}))
	}

	private async getPasswordHash(password: string): Promise<string> {
		return bcrypt.hash(password, env.USER_PASSWORD_BCRYPT_SALT_ROUNDS)
	}
}

function buildTechnicalUsername(value: string) {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')

	if (normalized.length >= 3) {
		return normalized.slice(0, 20)
	}

	return `svc_${nanoid(8)}`.slice(0, 20)
}
