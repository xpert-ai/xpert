import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { buildQueryString } from '@xpert-ai/server-common'
import {
	CurrenciesEnum,
	DefaultValueDateTypeEnum,
	IChangePasswordRequest,
	ID,
	IPasswordReset,
	IResetPasswordRequest,
	IRolePermission,
	ITenant,
	IUser,
	IUserEmailInput,
	IUserRegistrationInput,
	LanguagesEnum,
	mapTranslationLanguage,
	RolesEnum,
	UserType
} from '@xpert-ai/contracts'
import type { VerifiedEmailLoginInput } from '@xpert-ai/plugin-sdk'
import { SocialAuthService } from '@xpert-ai/server-auth'
import { environment as env, environment, IEnvironment } from '@xpert-ai/server-config'
import bcrypt from 'bcryptjs'
import { StringValue } from 'ms'
import { nanoid } from 'nanoid'
import { I18nService } from 'nestjs-i18n'
import { JsonWebTokenError, sign, verify } from 'jsonwebtoken'
import { t } from 'i18next'
import { DataSource, EntityManager, FindOptionsWhere, QueryFailedError, Repository } from 'typeorm'
import { EmailService } from '../email/email.service'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { AuthRegisterCommand, AuthTrialCommand } from './commands/index'
import { PasswordResetCreateCommand, PasswordResetGetCommand } from '../password-reset/commands'
import { RoleService } from '../role/role.service'
import { OrganizationService } from '../organization/organization.service'
import { Organization } from '../organization/organization.entity'
import { ReferralService } from '../referral'
import { ExternalIdentityBinding } from '../account-binding/external-identity-binding.entity'
import { Role } from '../role/role.entity'
import { RequestContext } from '../core/context'
import { Tenant } from '../tenant/tenant.entity'
import { EVENT_ORGANIZATION_CREATED, OrganizationCreatedEvent } from '../organization/events'

export interface RegisterVerifiedExternalIdentityInput extends VerifiedEmailLoginInput {
	password?: string
	confirmPassword?: string
	referralCode?: string
}

export interface RegisterVerifiedExternalIdentityResult {
	user: User
	created: boolean
}

@Injectable()
export class AuthService extends SocialAuthService {
	private readonly logger = new Logger(AuthService.name)

	@InjectRepository(User)
	private readonly userRepository: Repository<User>

	constructor(
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly organizationService: OrganizationService,
		private emailService: EmailService,
		private userOrganizationService: UserOrganizationService,
		private readonly i18n: I18nService,
		private readonly _configService: ConfigService<IEnvironment>,
		private readonly commandBus: CommandBus,
		private readonly dataSource: DataSource,
		private readonly referralService: ReferralService,
		private readonly eventEmitter: EventEmitter2
	) {
		super()
	}

	async resolveOrBindVerifiedEmail(input: VerifiedEmailLoginInput): Promise<User | null> {
		const normalizedInput = this.normalizeVerifiedEmailLoginInput(input)
		try {
			return await this.dataSource.transaction((manager) =>
				this.resolveOrBindVerifiedEmailWithManager(manager, normalizedInput)
			)
		} catch (error) {
			this.rethrowVerifiedIdentityConflict(error)
		}
	}

	async registerVerifiedExternalIdentity(
		input: RegisterVerifiedExternalIdentityInput,
		languageCode: LanguagesEnum
	): Promise<RegisterVerifiedExternalIdentityResult> {
		const normalizedInput = this.normalizeVerifiedEmailLoginInput(input)
		const password = this.requireVerifiedSignupValue(input?.password, 'password')
		const confirmPassword = this.requireVerifiedSignupValue(input?.confirmPassword, 'confirmPassword')
		if (password.length < 6) {
			throw new BadRequestException('The password must contain at least 6 characters.')
		}
		if (password !== confirmPassword) {
			throw new BadRequestException('The password and confirmation password must match.')
		}
		const hash = await this.getPasswordHash(password)

		let membershipCreation: {
			organizationId: string
			tenantId: string
			userId: string
		} | null = null
		let organizationCreation: {
			tenantId: string
			organizationId: string
			ownerUserId: string
		} | null = null
		let registrationOrganizationId: string | null = null

		let result: RegisterVerifiedExternalIdentityResult
		try {
			result = await this.dataSource.transaction(async (manager) => {
				const existingUser = await this.resolveOrBindVerifiedEmailWithManager(manager, normalizedInput)
				if (existingUser) {
					return {
						user: existingUser,
						created: false
					}
				}

				const role = await manager.getRepository(Role).findOne({
					where: {
						tenantId: normalizedInput.tenantId,
						name: RolesEnum.TRIAL
					}
				})
				if (!role) {
					throw new InternalServerErrorException(
						`The TRIAL role is not configured for tenant '${normalizedInput.tenantId}'.`
					)
				}

				const organizationRepository = manager.getRepository(Organization)
				const organization = await organizationRepository.save(
					organizationRepository.create({
						name: normalizedInput.displayName ?? normalizedInput.verifiedEmail,
						tenantId: normalizedInput.tenantId,
						currency: CurrenciesEnum.CNY,
						defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
						isDefault: false,
						isActive: true,
						show_profits: false,
						show_bonuses_paid: false,
						show_income: false,
						show_total_hours: false,
						show_projects_count: true,
						show_minimum_project_size: true,
						show_clients_count: true,
						show_clients: true,
						show_employees_count: true
					})
				)
				const resolvedOrganizationId = String(organization.id)
				registrationOrganizationId = resolvedOrganizationId

				const userRepository = manager.getRepository(User)
				const user = await userRepository.save(
					userRepository.create({
						type: UserType.USER,
						tenantId: normalizedInput.tenantId,
						email: normalizedInput.verifiedEmail,
						emailVerified: true,
						firstName: this.normalizeOptionalVerifiedIdentityValue(normalizedInput.displayName),
						imageUrl: this.normalizeOptionalVerifiedIdentityValue(normalizedInput.avatarUrl),
						hash,
						role
					})
				)

				const membership = await this.userOrganizationService.ensureMembershipInTransaction(manager, {
					organizationId: resolvedOrganizationId,
					tenantId: normalizedInput.tenantId,
					userId: String(user.id)
				})
				if (membership.created) {
					membershipCreation = {
						organizationId: resolvedOrganizationId,
						tenantId: normalizedInput.tenantId,
						userId: String(user.id)
					}
				}
				organizationCreation = {
					tenantId: normalizedInput.tenantId,
					organizationId: resolvedOrganizationId,
					ownerUserId: String(user.id)
				}

				await this.referralService.bindRegistration(manager, {
					tenantId: normalizedInput.tenantId,
					referredUserId: String(user.id),
					referralCode: input.referralCode
				})

				await this.createStrictVerifiedIdentityBinding(manager, {
					...normalizedInput,
					userId: String(user.id)
				})

				return {
					user,
					created: true
				}
			})
		} catch (error) {
			this.rethrowVerifiedIdentityConflict(error)
		}

		if (organizationCreation) {
			this.eventEmitter.emit(
				EVENT_ORGANIZATION_CREATED,
				new OrganizationCreatedEvent(
					organizationCreation.tenantId,
					organizationCreation.organizationId,
					organizationCreation.ownerUserId
				)
			)
		}
		if (membershipCreation) {
			await this.userOrganizationService.completeMembershipCreation(membershipCreation)
		}
		if (result.created) {
			this.emailService.welcomeUser(result.user, languageCode, registrationOrganizationId ?? undefined, undefined)
		}
		return result
	}

	private async resolveOrBindVerifiedEmailWithManager(
		manager: EntityManager,
		input: VerifiedEmailLoginInput
	): Promise<User | null> {
		const bindingRepository = manager.getRepository(ExternalIdentityBinding)
		const userRepository = manager.getRepository(User)
		const existingBinding = await bindingRepository.findOne({
			where: {
				tenantId: input.tenantId,
				provider: input.provider,
				subjectId: input.subjectId
			}
		})

		if (existingBinding) {
			const boundUser = await userRepository.findOne({
				where: {
					id: existingBinding.userId,
					tenantId: input.tenantId
				},
				withDeleted: true
			})
			this.assertEligibleVerifiedIdentityUser(boundUser)

			if (input.profile !== undefined) {
				existingBinding.profile = this.normalizeVerifiedIdentityProfile(input.profile) ?? null
				await bindingRepository.save(existingBinding)
			}
			return boundUser
		}

		await this.lockTenantRegistrationScope(manager, input.tenantId)

		const matchingUsers = await userRepository
			.createQueryBuilder('user')
			.where('user.tenantId = :tenantId', { tenantId: input.tenantId })
			.andWhere('LOWER(user.email) = :verifiedEmail', {
				verifiedEmail: input.verifiedEmail
			})
			.orderBy('user.createdAt', 'ASC')
			.take(2)
			.getMany()

		if (matchingUsers.length > 1) {
			throw new ConflictException('Multiple Xpert accounts use this verified email in the current tenant.')
		}
		if (matchingUsers.length === 0) {
			return null
		}

		const [matchedUser] = matchingUsers
		this.assertEligibleVerifiedIdentityUser(matchedUser)
		const existingUserBinding = await bindingRepository.findOne({
			where: {
				tenantId: input.tenantId,
				provider: input.provider,
				userId: matchedUser.id
			}
		})
		if (existingUserBinding && existingUserBinding.subjectId !== input.subjectId) {
			throw new ConflictException(`This Xpert account is already bound to another ${input.provider} identity.`)
		}

		if (!matchedUser.emailVerified) {
			matchedUser.emailVerified = true
			await userRepository.save(matchedUser)
		}
		await this.createStrictVerifiedIdentityBinding(manager, {
			...input,
			userId: String(matchedUser.id)
		})
		return matchedUser
	}

	private async createStrictVerifiedIdentityBinding(
		manager: EntityManager,
		input: VerifiedEmailLoginInput & {
			userId: string
		}
	): Promise<ExternalIdentityBinding> {
		const bindingRepository = manager.getRepository(ExternalIdentityBinding)
		const [subjectBinding, userBinding] = await Promise.all([
			bindingRepository.findOne({
				where: {
					tenantId: input.tenantId,
					provider: input.provider,
					subjectId: input.subjectId
				}
			}),
			bindingRepository.findOne({
				where: {
					tenantId: input.tenantId,
					provider: input.provider,
					userId: input.userId
				}
			})
		])

		if (subjectBinding && subjectBinding.userId !== input.userId) {
			throw new ConflictException(`This ${input.provider} identity is already bound to another Xpert account.`)
		}
		if (userBinding && userBinding.subjectId !== input.subjectId) {
			throw new ConflictException(`This Xpert account is already bound to another ${input.provider} identity.`)
		}

		const binding = subjectBinding ?? userBinding
		if (binding) {
			if (input.profile !== undefined) {
				binding.profile = this.normalizeVerifiedIdentityProfile(input.profile) ?? null
				return bindingRepository.save(binding)
			}
			return binding
		}

		return bindingRepository.save(
			bindingRepository.create({
				tenantId: input.tenantId,
				userId: input.userId,
				provider: input.provider,
				subjectId: input.subjectId,
				profile: this.normalizeVerifiedIdentityProfile(input.profile) ?? null,
				createdById: RequestContext.currentUserId() ?? undefined,
				updatedById: RequestContext.currentUserId() ?? undefined
			})
		)
	}

	private normalizeVerifiedEmailLoginInput(input: VerifiedEmailLoginInput): VerifiedEmailLoginInput {
		const provider = this.requireVerifiedSignupValue(input?.provider, 'provider')
		const subjectId = this.requireVerifiedSignupValue(input?.subjectId, 'subjectId')
		const tenantId = this.requireVerifiedSignupValue(input?.tenantId, 'tenantId')
		const verifiedEmail = this.requireVerifiedSignupValue(input?.verifiedEmail, 'verifiedEmail').toLowerCase()
		if (!verifiedEmail.includes('@') || /\s/.test(verifiedEmail)) {
			throw new BadRequestException("'verifiedEmail' must be a valid email address.")
		}

		return {
			provider,
			subjectId,
			tenantId,
			verifiedEmail,
			displayName: this.normalizeOptionalVerifiedIdentityValue(input?.displayName),
			avatarUrl: this.normalizeOptionalVerifiedIdentityValue(input?.avatarUrl),
			profile: this.normalizeVerifiedIdentityProfile(input?.profile),
			returnTo: this.normalizeOptionalVerifiedIdentityValue(input?.returnTo)
		}
	}

	private assertEligibleVerifiedIdentityUser(user: User | null): asserts user is User {
		if (
			!user ||
			user.deletedAt ||
			user.type !== UserType.USER ||
			typeof user.hash !== 'string' ||
			user.hash.trim().length === 0
		) {
			throw new ConflictException(
				'The verified email or external identity belongs to an account that cannot use SSO login.'
			)
		}
	}

	private requireVerifiedSignupValue(value: string | null | undefined, field: string): string {
		const normalized = this.normalizeOptionalVerifiedIdentityValue(value)
		if (!normalized) {
			throw new BadRequestException(`'${field}' is required.`)
		}
		return normalized
	}

	private normalizeOptionalVerifiedIdentityValue(value: string | null | undefined): string | undefined {
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
	}

	private normalizeVerifiedIdentityProfile(
		profile: Record<string, unknown> | null | undefined
	): Record<string, any> | undefined {
		if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
			return undefined
		}
		return JSON.parse(JSON.stringify(profile))
	}

	private rethrowVerifiedIdentityConflict(error: unknown): never {
		if (
			error instanceof QueryFailedError &&
			(error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
		) {
			throw new ConflictException('The external identity or Xpert account was bound by another request.')
		}
		throw error
	}

	private async lockTenantRegistrationScope(manager: EntityManager, tenantId: string): Promise<void> {
		const tenant = await manager.getRepository(Tenant).findOne({
			select: {
				id: true
			},
			where: {
				id: tenantId
			},
			lock: {
				mode: 'pessimistic_write'
			}
		})
		if (!tenant?.id) {
			throw new BadRequestException(
				t('server-ai:Error.RegistrationTenantRequired', {
					defaultValue: 'Tenant is required for registration.'
				})
			)
		}
	}

	async validateUser(email: string, password: string): Promise<any> {
		const normalizedIdentifier = email?.trim().toLowerCase()
		const user = await this.userService.findOneByOptions({
			where: { email: normalizedIdentifier, emailVerified: true },
			order: {
				createdAt: 'DESC'
			}
		})
		if (!user || !(await bcrypt.compare(password, user.hash))) {
			throw new UnauthorizedException()
		}
		return user
	}

	async requestPassword(
		request: FindOptionsWhere<User>,
		languageCode: LanguagesEnum,
		originUrl?: string
	): Promise<boolean | BadRequestException> {
		try {
			const user = await this.userService.findOneByOptions({
				where: request,
				relations: ['role', 'employee']
			})
			try {
				/**
				 * Create password reset request
				 */
				const { token } = await this.createToken(user)
				if (token) {
					await this.commandBus.execute(
						new PasswordResetCreateCommand({
							email: user.email,
							token
						})
					)

					const url = `${environment.clientBaseUrl}/auth/reset-password?token=${token}`
					const { organizationId } = await this.userOrganizationService.findOneByOptions({
						where: {
							user
						}
					})

					this.emailService.requestPassword(user, url, languageCode, organizationId, originUrl)

					// Return success status
					return true
				}
			} catch (error) {
				console.log(error)
				throw new InternalServerErrorException()
			}
		} catch (error) {
			console.log(error)
			throw new NotFoundException('Email is not correct, please try again.')
		}
	}

	/**
	 * Initiates the process to request a password reset.
	 *
	 * @param request - The reset password request object containing the email address.
	 * @param languageCode - The language code used for email communication.
	 * @param originUrl - Optional parameter representing the origin URL of the request.
	 * @returns A Promise that resolves to a boolean indicating the success of the password reset request
	 *          or throws a BadRequestException in case of failure.
	 */
	async requestResetPassword(
		request: IResetPasswordRequest,
		languageCode: LanguagesEnum,
		originUrl?: string
	): Promise<boolean | BadRequestException> {
		try {
			const { email } = request

			// Fetch users with specific criteria
			const users = await this.fetchUsers(email)

			// Throw an exception if no matching users are found
			if (users.length === 0) {
				throw new BadRequestException('Forgot password request failed!')
			}

			// Initialize an array to store reset links along with tenant and user information
			const tenantUsersMap: { resetLink: string; tenant?: ITenant; user: IUser }[] = []

			// Iterate through users and generate reset links
			for await (const user of users) {
				const { email, tenantId } = user
				const { token } = await this.createToken(user)

				// Proceed if a valid token and email are obtained
				if (!!token && !!email) {
					try {
						// Create a password reset request and generate a reset link
						await this.commandBus.execute(
							new PasswordResetCreateCommand({
								email,
								tenantId,
								token
							})
						)

						// Initialize Base URL
						const baseURL = `${environment.clientBaseUrl}/auth/reset-password`

						// Generate the reset link using the helper function
						const resetLink = this.generateResetLink(baseURL, token, email, tenantId)

						// Add the reset link, tenant, and user to the tenantUsersMap array
						tenantUsersMap.push({ resetLink, tenant: user.tenant ?? undefined, user })
					} catch (error) {
						throw new BadRequestException('Forgot password request failed!')
					}
				}
			}

			// If there is only one user, send a password reset email
			if (users.length === 1) {
				const [user] = users
				const [tenantUserMap] = tenantUsersMap

				if (tenantUserMap) {
					const { resetLink } = tenantUserMap
					this.emailService.requestPassword(user, resetLink, languageCode, null, originUrl)
				}
			} else {
				// If multiple users are found, send a multi-tenant password reset email
				// this.emailService.multiTenantResetPassword(email, tenantUsersMap, languageCode, originUrl);
			}

			// Return success status
			return true
		} catch (error) {
			// Throw a BadRequestException in case of failure
			throw new BadRequestException('Forgot password request failed!')
		}
	}

	/**
	 * Generates a password reset link.
	 *
	 * @param baseURL The base URL for the reset password page.
	 * @param token The token generated for the password reset.
	 * @param email The email of the user.
	 * @param tenantId The tenant ID (optional).
	 * @returns The password reset link.
	 */
	generateResetLink(baseURL: string, token: string, email: string, tenantId?: ID): string {
		// Initialize an object to store query parameters
		const params: { [key: string]: string | ID } = { token, email }

		// Add tenantId to the reset link only if it's available
		if (tenantId) {
			params['tenantId'] = tenantId
		}

		// Convert query params object to a string
		const queryString = buildQueryString(params)

		// Combine base URL with query params
		return `${baseURL}?${queryString}`
	}

	/**
	 * Fetch users from the repository based on specific criteria.
	 *
	 * @param {string} email - The user's email address.
	 * @returns {Promise<User[]>} A Promise that resolves to an array of User objects.
	 */
	async fetchUsers(email: IUserEmailInput['email']): Promise<User[]> {
		const normalizedEmail = email?.trim().toLowerCase()
		// Find users matching the criteria
		return await this.userRepository.find({
			where: { email: normalizedEmail },
			relations: { tenant: true, role: true }
		})
	}

	/**
	 * Change password
	 *
	 * @param request
	 */
	async resetPassword(request: IChangePasswordRequest) {
		try {
			const { password, token } = request
			const record: IPasswordReset = await this.commandBus.execute(
				new PasswordResetGetCommand({
					token
				})
			)
			if (record.expired) {
				throw new BadRequestException('Password Reset Failed (code: 1).')
			}
			const { id, tenantId } = verify(token, environment.JWT_SECRET) as {
				id: string
				tenantId: string
			}
			try {
				const user = await this.userService.findOneByIdString(id, {
					where: {
						tenantId
					},
					relations: ['tenant']
				})
				if (user) {
					const hash = await this.getPasswordHash(password)
					await this.userService.changePassword(user.id, hash)
					// Confirm email verified when changed password
					if (!user.emailVerified) {
						await this.userService.update(user.id, { emailVerified: true })
					}
					return true
				}
			} catch (error) {
				throw new BadRequestException('Password Reset Failed (code: 2).')
			}
		} catch (error) {
			throw new BadRequestException('Password Reset Failed (code: 3).')
		}
	}

	/**
	 * signup for free user
	 */
	async signup(input: IUserRegistrationInput, languageCode: LanguagesEnum) {
		const emailVerificationToken = nanoid()
		const user = await this.createRegisteredUser(input, languageCode, {
			emailVerified: false,
			emailVerificationToken
		})
		const url = `${environment.clientBaseUrl}/auth/verify?token=${emailVerificationToken}`
		await this.emailService.sendVerifyEmailMail(user, languageCode, url, input.organizationId, input.originalUrl)
		return user
	}

	/**
	 * Shared method involved in
	 * 1. Sign up
	 * 2. Addition of new user to organization
	 * 3. User invite accept scenario
	 *
	 * @param input
	 * @param languageCode
	 * @returns
	 */
	async register(input: IUserRegistrationInput, languageCode: LanguagesEnum): Promise<User> {
		let tenant = input.user.tenant

		if (input.createdById) {
			const creatingUser = await this.userService.findOne(input.createdById, {
				relations: ['tenant']
			})
			tenant = creatingUser.tenant
		}

		const user = await this.createRegisteredUser(
			{
				...input,
				referralCode: input.createdById || input.isImporting ? undefined : input.referralCode,
				user: {
					...input.user,
					tenant
				}
			},
			languageCode
		)
		const resolvedOrganizationId = input.organizationId ?? (await this.resolveDefaultOrganizationId(tenant?.id))
		this.emailService.welcomeUser(user, languageCode, resolvedOrganizationId, input.originalUrl)
		return user
	}

	private async createRegisteredUser(
		input: IUserRegistrationInput,
		languageCode: LanguagesEnum,
		options?: {
			emailVerified?: boolean
			emailVerificationToken?: string
		}
	): Promise<User> {
		const normalizedEmail = input.user.email?.trim().toLowerCase()
		const normalizedUsername = input.user.username?.trim().toLowerCase()
		const tenantId = input.user.tenant?.id ?? input.user.tenantId
		if (!tenantId) {
			throw new BadRequestException(
				t('server-ai:Error.RegistrationTenantRequired', {
					defaultValue: 'Tenant is required for registration.'
				})
			)
		}
		const hash = input.password ? await this.getPasswordHash(input.password) : input.user.hash

		const registration = await this.dataSource.transaction(async (manager) => {
			const userRepository = manager.getRepository(User)
			await this.lockTenantRegistrationScope(manager, tenantId)
			const where: FindOptionsWhere<User>[] = []
			if (normalizedEmail) {
				where.push({
					tenantId,
					email: normalizedEmail
				})
			}
			if (normalizedUsername) {
				where.push({
					tenantId,
					username: normalizedUsername
				})
			}

			const existingUser = where.length
				? await userRepository.findOne({
						where
					})
				: null
			const isUpdatingPendingSignup =
				!!input.user.id && existingUser?.id === input.user.id && options?.emailVerified === false
			if (existingUser && !isUpdatingPendingSignup) {
				throw new BadRequestException(
					await this.i18n.translate('core.User.Error.AccountAlreadyExists', {
						lang: mapTranslationLanguage(languageCode)
					})
				)
			}

			const user = await userRepository.save(
				userRepository.create({
					...input.user,
					email: normalizedEmail,
					username: normalizedUsername,
					tenantId,
					tenant: input.user.tenant ?? { id: tenantId },
					hash,
					emailVerified: options?.emailVerified ?? true,
					...(options?.emailVerificationToken
						? {
								emailVerification: {
									tenantId,
									token: options.emailVerificationToken,
									validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2)
								}
							}
						: {})
				})
			)
			const hydratedUser = await userRepository.findOne({
				where: { id: user.id },
				relations: {
					role: true,
					tenant: true
				}
			})
			if (!hydratedUser) {
				throw new InternalServerErrorException(
					t('server-ai:Error.RegisteredUserLoadFailed', {
						defaultValue: 'Registered user could not be loaded.'
					})
				)
			}

			const organizationId =
				input.organizationId ?? (await this.resolveDefaultOrganizationIdWithManager(manager, tenantId))
			let membershipCreation: {
				organizationId: string
				tenantId: string
				userId: string
			} | null = null
			if (organizationId && hydratedUser.role?.name !== RolesEnum.SUPER_ADMIN) {
				const membership = await this.userOrganizationService.ensureMembershipInTransaction(manager, {
					organizationId,
					tenantId,
					userId: String(hydratedUser.id)
				})
				if (membership.created) {
					membershipCreation = {
						organizationId,
						tenantId,
						userId: String(hydratedUser.id)
					}
				}
			}
			await this.referralService.bindRegistration(manager, {
				tenantId,
				referredUserId: String(hydratedUser.id),
				referralCode: input.referralCode
			})

			return {
				user: hydratedUser,
				membershipCreation
			}
		})

		if (registration.membershipCreation) {
			await this.userOrganizationService.completeMembershipCreation(registration.membershipCreation)
		}

		return registration.user
	}

	private async resolveDefaultOrganizationIdWithManager(manager: EntityManager, tenantId: string) {
		const organization = await manager.getRepository(Organization).findOne({
			select: {
				id: true
			},
			where: {
				tenantId,
				isDefault: true,
				isActive: true
			}
		})
		return organization?.id ? String(organization.id) : undefined
	}

	private async resolveDefaultOrganizationId(tenantId?: string): Promise<string | undefined> {
		if (!tenantId) {
			return undefined
		}

		const organization = await this.organizationService.findOneByOptions({
			select: ['id'],
			where: {
				tenantId,
				isDefault: true,
				isActive: true
			}
		})

		return organization?.id
	}

	async getAuthenticatedUser(id: string, thirdPartyId?: string): Promise<User> {
		return thirdPartyId ? this.userService.getIfExistsThirdParty(thirdPartyId) : this.userService.getIfExists(id)
	}

	async isAuthenticated(token: string): Promise<boolean> {
		try {
			const JWT_SECRET = this._configService.get('JWT_SECRET', { infer: true })
			const { id, thirdPartyId } = verify(token, JWT_SECRET) as {
				id: string
				thirdPartyId: string
			}

			let result: Promise<boolean>

			if (thirdPartyId) {
				result = this.userService.checkIfExistsThirdParty(thirdPartyId)
			} else {
				result = this.userService.checkIfExists(id)
			}

			return result
		} catch (err) {
			if (err instanceof JsonWebTokenError) {
				return false
			} else {
				throw err
			}
		}
	}

	async hasRole(token: string, roles: string[] = []): Promise<boolean> {
		try {
			const JWT_SECRET = this._configService.get('JWT_SECRET', { infer: true })
			const { role } = verify(token, JWT_SECRET) as {
				id: string
				role: string
			}
			return role ? roles.includes(role) : false
		} catch (err) {
			if (err instanceof JsonWebTokenError) {
				return false
			} else {
				throw err
			}
		}
	}

	async validateOAuthLoginUser(args: any): Promise<{
		success: boolean
		authData: { jwt: string; refreshToken: string; userId: string }
	}> {
		let response = {
			success: false,
			authData: { jwt: null, refreshToken: null, userId: null }
		}

		const userExist = await this.userService.getIfExistsUser({
			email: args.emails?.[0].value,
			mobile: args.mobile,
			thirdPartyId: args.thirdPartyId
		})

		if (userExist) {
			const { token, refreshToken } = await this.createToken(userExist)

			response = {
				success: true,
				authData: { jwt: token, refreshToken, userId: userExist.id }
			}
		}

		if (!response.success) {
			// auto create third party user
			const user = await this.commandBus.execute(
				new AuthTrialCommand(
					{
						user: {
							firstName: args.name,
							thirdPartyId: args.thirdPartyId,
							mobile: args.mobile,
							email: args.emails?.[0]?.value,
							imageUrl: args.imageUrl
						},
						originalUrl: 'oauth'
					},
					LanguagesEnum.Chinese
				)
			)
			const { token, refreshToken } = await this.createToken(user)
			response = {
				success: true,
				authData: { jwt: token, refreshToken, userId: user.id }
			}
		}
		return response
	}

	async validateOAuthLoginEmail(emails: Array<{ value: string; verified: boolean }>): Promise<{
		success: boolean
		authData: { jwt: string; userId: string }
	}> {
		let response = {
			success: false,
			authData: { jwt: null, userId: null }
		}

		try {
			for (const { value } of emails) {
				const userExist = await this.userService.checkIfExistsEmail(value)
				if (userExist) {
					const user = await this.userService.getUserByEmail(value)
					const { token } = await this.createToken(user)

					response = {
						success: true,
						authData: { jwt: token, userId: user.id }
					}
					break
				}
			}

			// auto create email user
			if (!response.success) {
				const user = await this.commandBus.execute(
					new AuthTrialCommand(
						{ user: { email: emails[0].value }, originalUrl: 'oauth' },
						LanguagesEnum.Chinese
					)
				)
				const { token } = await this.createToken(user)
				response = {
					success: true,
					authData: { jwt: token, userId: user.id }
				}
			}

			return response
		} catch (err) {
			throw new InternalServerErrorException('validateOAuthLoginEmail', err.message)
		}
	}

	async validateOAuthLoginMobile(args: any): Promise<{
		success: boolean
		authData: { jwt: string; refreshToken: string; userId: string }
	}> {
		this.logger.debug(`validate OAuth login mobile:`, args)
		let response = {
			success: false,
			authData: { jwt: null, refreshToken: null, userId: null }
		}

		const userExist = await this.userService.getIfExistsUser({
			email: args.emails?.[0].value,
			mobile: args.mobile,
			thirdPartyId: args.thirdPartyId
		})

		if (userExist) {
			const { token, refreshToken } = await this.createToken(userExist)

			response = {
				success: true,
				authData: { jwt: token, refreshToken, userId: userExist.id }
			}
		}

		if (!response.success) {
			const role = await this.roleService.findOne({ where: { tenantId: args.tenantId, name: args.roleName } })
			// auto create third party user
			const user = await this.commandBus.execute(
				new AuthRegisterCommand(
					{
						user: {
							username: args.username,
							firstName: args.name,
							thirdPartyId: args.thirdPartyId,
							mobile: args.mobile,
							email: args.emails?.[0]?.value,
							imageUrl: args.imageUrl,
							tenantId: args.tenantId,
							role
						},
						organizationId: args.organizationId,
						originalUrl: 'oauth'
					},
					LanguagesEnum.Chinese
				)
			)

			const { token, refreshToken } = await this.createToken(user)
			response = {
				success: true,
				authData: { jwt: token, refreshToken, userId: user.id }
			}
		}
		return response
	}

	async refreshTokens(userId: string, refreshToken: string) {
		const user = await this.userService.findOne(userId)
		if (!user?.refreshToken) {
			throw new ForbiddenException('Access Denied')
		}

		const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken)

		if (!refreshTokenMatches) {
			throw new ForbiddenException('Access Denied')
		}
		const tokens = await this.createToken(user)

		await this.updateRefreshToken(user.id, tokens.refreshToken)
		return tokens
	}

	async issueTokensForUser(userId: string): Promise<{ jwt: string; refreshToken: string; userId: string }> {
		const user = await this.userService.findOne(userId)

		if (!user) {
			throw new NotFoundException(`The user '${userId}' was not found`)
		}

		const { token, refreshToken } = await this.createToken(user)
		await this.updateRefreshToken(user.id, refreshToken)

		return {
			jwt: token,
			refreshToken,
			userId: user.id
		}
	}

	async updateRefreshToken(userId: string, refreshToken: string) {
		const hashedRefreshToken = await this.getPasswordHash(refreshToken)
		await this.userService.update(userId, {
			refreshToken: hashedRefreshToken
		})
	}

	async createToken(user: Partial<User>): Promise<{ token: string; refreshToken: string }> {
		if (!user.role || !user.employee) {
			user = await this.userService.findOne(user.id, {
				relations: ['role', 'role.rolePermissions', 'employee']
			})
		}

		const payload: any = {
			id: user.id,
			tenantId: user.tenantId,
			employeeId: user.employee ? user.employee.id : null
		}

		if (user.role) {
			payload.role = user.role.name
			if (user.role.rolePermissions) {
				payload.permissions = user.role.rolePermissions
					.filter((rolePermission: IRolePermission) => rolePermission.enabled)
					.map((rolePermission: IRolePermission) => rolePermission.permission)
			} else {
				payload.permissions = null
			}
		} else {
			payload.role = null
		}

		const JWT_SECRET = this._configService.get('JWT_SECRET', { infer: true })
		const jwtExpiresIn = this._configService.get<StringValue | number>('jwtExpiresIn', { infer: true })
		const JWT_REFRESH_SECRET = this._configService.get('JWT_REFRESH_SECRET', { infer: true })
		const jwtRefreshExpiresIn = this._configService.get<StringValue | number>('jwtRefreshExpiresIn', {
			infer: true
		})

		const token: string = sign(payload, JWT_SECRET, {
			expiresIn: jwtExpiresIn
		})
		const refreshToken = sign(payload, JWT_REFRESH_SECRET, {
			expiresIn: jwtRefreshExpiresIn
		})

		return { token, refreshToken }
	}

	async verifyEmail(token: string): Promise<void> {
		await this.userService.verifyEmail(token)
	}

	async resendVerificationMail(user: User, languageCode: LanguagesEnum) {
		const emailVerificationToken = nanoid()
		await this.userService.update(user.id, {
			emailVerification: {
				token: emailVerificationToken,
				validUntil: new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 2)
			}
		})

		const url = `${environment.clientBaseUrl}/auth/verify?token=${emailVerificationToken}`
		this.emailService.sendVerifyEmailMail(user, languageCode, url)

		return user
	}
}
