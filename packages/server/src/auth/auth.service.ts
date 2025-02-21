import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import {
	IAuthResponse,
	IChangePasswordRequest,
	IPasswordReset,
	IRolePermission,
	IUserRegistrationInput,
	LanguagesEnum,
	mapTranslationLanguage,
} from '@metad/contracts'
import { SocialAuthService } from '@metad/server-auth'
import { environment as env, environment, IEnvironment } from '@metad/server-config'
import * as bcrypt from 'bcrypt'
import { nanoid } from 'nanoid'
import { I18nService } from 'nestjs-i18n'
import { JsonWebTokenError, sign, verify } from 'jsonwebtoken'
import { FindConditions, getManager } from 'typeorm'
import { EmailService } from '../email/email.service'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { ImportRecordUpdateOrCreateCommand } from './../export-import/import-record'
import { AuthRegisterCommand, AuthTrialCommand } from './commands/index'
import { PasswordResetCreateCommand, PasswordResetGetCommand } from '../password-reset/commands'
import { RoleService } from '../role/role.service'


@Injectable()
export class AuthService extends SocialAuthService {

	private readonly logger = new Logger(AuthService.name)

	constructor(
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private emailService: EmailService,
		private userOrganizationService: UserOrganizationService,
		private readonly i18n: I18nService,
		private readonly _configService: ConfigService<IEnvironment>,
		private readonly commandBus: CommandBus,
	) {
		super()
	}

	async validateUser(email: string, password: string): Promise<any> {
		const user = await this.userService.findOneByConditions({ email, emailVerified: true }, {
			order: {
				createdAt: 'DESC'
			}
		})
		if (!user || !(await bcrypt.compare(password, user.hash))) {
		  throw new UnauthorizedException();
		}
		return user;
	}

	/**
	 * User Login Request
	 * 
	 * @param email username or email
	 * @param password 
	 * @returns 
	 */
	async login(email: string, password: string): Promise<IAuthResponse | null> {
		const user = await this.userService.findOneByOptions(
			{
				where: [{ email, emailVerified: true }, {username: email}],
				relations: ['role', 'role.rolePermissions', 'employee'],
				order: {
					createdAt: 'DESC'
				}
			}
		);
		if (!user?.hash || !(await bcrypt.compare(password, user.hash))) {
			return null;
		}
		const { token, refreshToken } = await this.createToken(user)

		await this.updateRefreshToken(user.id, refreshToken)

		return {
			user,
			token,
			refreshToken
		};
	}

	async requestPassword(
		request: any,
		languageCode: LanguagesEnum,
		originUrl?: string
	): Promise<boolean | BadRequestException> {

		try {
			const user = await this.userService.findOneByConditions(request, {
				relations: ['role', 'employee']
			});
			try {
				/**
				 * Create password reset request
				 */
				const { token } = await this.createToken(user);
				if (token) {
					await this.commandBus.execute(
						new PasswordResetCreateCommand({
							email: user.email,
							token
						})
					);

					const url = `${environment.clientBaseUrl}/auth/reset-password?token=${token}`;
					const { organizationId } = await this.userOrganizationService.findOneByOptions({
						where: {
							user
						}
					});
					
					this.emailService.requestPassword(
						user,
						url,
						languageCode,
						organizationId,
						originUrl
					);
					
					// Return success status
					return true;
				}
			} catch (error) {
				console.log(error);
				throw new InternalServerErrorException();
			}
		} catch (error) {
			console.log(error);
			throw new NotFoundException('Email is not correct, please try again.');
		}
	}

	/**
	 * Change password
	 * 
	 * @param request 
	 */
	 async resetPassword(request: IChangePasswordRequest) {
		try {
			const { password, token } = request;
			const record: IPasswordReset = await this.commandBus.execute(
				new PasswordResetGetCommand({
					token
				})
			);
			if (record.expired) {
				throw new BadRequestException('Password Reset Failed (code: 1).');
			}
			const { id, tenantId } = verify(token, environment.JWT_SECRET) as {
				id: string;
				tenantId: string;
			};
			try {
				const user = await this.userService.findOneByIdString(
					id,
					{
						where: {
							tenantId
						},
						relations: ['tenant']
					}
				);
				if (user) {
					const hash = await this.getPasswordHash(password);
					await this.userService.changePassword(user.id, hash);
					// Confirm email verified when changed password
					if (!user.emailVerified) {
						await this.userService.update(user.id, {emailVerified: true})
					}
					return true;
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
	async signup(
		input: IUserRegistrationInput,
		languageCode: LanguagesEnum
	) {
		const emailVerificationToken = nanoid();
		const _user = await this.userService.create({
			...input.user,
			...(input.password
				? {
						hash: await this.getPasswordHash(input.password),
				  }
				: {}),
			emailVerification: {
				tenantId: input.user.tenantId,
				token: emailVerificationToken,
				validUntil: new Date((new Date()).getTime() + 1000 * 60 * 60 * 24 * 2) // 2 days later
			}
		})

		this.logger.debug(`Created user '${_user.email}'`)

		const user = await this.userService.findOne(_user.id, {
			relations: ['role'],
		})

		if (input.organizationId) {
			await this.userOrganizationService.addUserToOrganization( 
				user,
				input.organizationId
			)
		}

		this.logger.debug(`Added user '${user.email}' to organization '${input.organizationId}'`)

		const url = `${environment.clientBaseUrl}/auth/verify?token=${emailVerificationToken}`;
		await this.emailService.sendVerifyEmailMail(
			user,
			languageCode,
			url,
			input.organizationId,
			input.originalUrl
		)

		this.logger.debug(`Sent email varify mail`)

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
	async register(
		input: IUserRegistrationInput,
		languageCode: LanguagesEnum
	): Promise<User> {
		let tenant = input.user.tenant

		if (input.createdById) {
			const creatingUser = await this.userService.findOne(input.createdById, {
				relations: ['tenant'],
			})
			tenant = creatingUser.tenant
		}

		
		// Uniqueness Check
		const where: FindConditions<User>[] = []
		if (input.user.email) {
			where.push({
				tenantId: tenant.id,
				email: input.user.email.toLowerCase()
			})
		}
		if (input.user.username) {
			where.push({
				tenantId: tenant.id,
				email: input.user.username.toLowerCase()
			})
		}
		const exist = await this.userService.findOneOrFail({
			where
		})

		if (exist.success) {
			throw new BadRequestException(
				await this.i18n.translate(
					'core.User.Error.AccountAlreadyExists',
					{
						lang: mapTranslationLanguage(languageCode),
					}
				)
			)
		}

		// Create User
		const _user = await this.userService.create({
			...input.user,
			email: input.user.email?.toLowerCase(),
			username: input.user.username?.toLowerCase(),
			tenant,
			...(input.password
				? {
					hash: await this.getPasswordHash(input.password),
				  }
				: {}),
			emailVerified: true
		})

		const user = await this.userService.findOne(_user.id, {
			relations: ['role'],
		})

		if (input.organizationId) {
			await this.userOrganizationService.addUserToOrganization(
				user,
				input.organizationId
			)
		}

		//6. Create Import Records while migrating for relative user.
		const { isImporting = false, sourceId = null } = input
		if (isImporting && sourceId) {
			const { sourceId } = input
			await this.commandBus.execute(
				new ImportRecordUpdateOrCreateCommand({
					entityType: getManager().getRepository(User).metadata.tableName,
					sourceId,
					destinationId: user.id,
				})
			)
		}

		this.emailService.welcomeUser(
			user,
			languageCode,
			input.organizationId,
			input.originalUrl
		)

		return user
	}

	async getAuthenticatedUser(id: string, thirdPartyId?: string): Promise<User> {
		return thirdPartyId
			? this.userService.getIfExistsThirdParty(thirdPartyId)
			: this.userService.getIfExists(id)
	}

	async isAuthenticated(token: string): Promise<boolean> {
		try {
			const JWT_SECRET = this._configService.get('JWT_SECRET', {infer: true})
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
			const JWT_SECRET = this._configService.get('JWT_SECRET', {infer: true})
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
			authData: { jwt: null, refreshToken: null, userId: null },
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
				authData: { jwt: token, refreshToken, userId: userExist.id },
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
				authData: { jwt: token, refreshToken, userId: user.id },
			}
		}
		return response
	}

	async validateOAuthLoginEmail(
		emails: Array<{ value: string; verified: boolean }>
	): Promise<{
		success: boolean
		authData: { jwt: string; userId: string }
	}> {
		let response = {
			success: false,
			authData: { jwt: null, userId: null },
		}

		try {
			for (const { value } of emails) {
				const userExist = await this.userService.checkIfExistsEmail(value)
				if (userExist) {
					const user = await this.userService.getUserByEmail(value)
					const { token } = await this.createToken(user)

					response = {
						success: true,
						authData: { jwt: token, userId: user.id },
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
					authData: { jwt: token, userId: user.id },
				}
			}

			return response
		} catch (err) {
			throw new InternalServerErrorException(
				'validateOAuthLoginEmail',
				err.message
			)
		}
	}

	async validateOAuthLoginMobile(args: any): Promise<{
		success: boolean
		authData: { jwt: string; refreshToken: string; userId: string }
	}> {
		this.logger.debug(`validate OAuth login mobile:`, args)
		let response = {
			success: false,
			authData: { jwt: null, refreshToken: null, userId: null },
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
				authData: { jwt: token, refreshToken, userId: userExist.id },
			}
		}

		if (!response.success) {
			const role = await this.roleService.findOne({where: {tenantId: args.tenantId, name: args.roleName}})
			// auto create third party user
			const user = await this.commandBus.execute(
				new AuthRegisterCommand({
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
			);
	
			const { token, refreshToken } = await this.createToken(user)
			response = {
				success: true,
				authData: { jwt: token, refreshToken, userId: user.id },
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

	async updateRefreshToken(userId: string, refreshToken: string) {
		const hashedRefreshToken = await this.getPasswordHash(refreshToken)
		await this.userService.update(userId, {
		  refreshToken: hashedRefreshToken,
		})
	}

	async createToken(user: Partial<User>): Promise<{ token: string, refreshToken: string }> {
		if (!user.role || !user.employee) {
			user = await this.userService.findOne(user.id, {
				relations: ['role', 'role.rolePermissions', 'employee'],
			})
		}

		const payload: any = {
			id: user.id,
			tenantId: user.tenantId,
			employeeId: user.employee ? user.employee.id : null,
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

		const JWT_SECRET = this._configService.get('JWT_SECRET', {infer: true})
		const jwtExpiresIn = this._configService.get('jwtExpiresIn', {infer: true})
		const JWT_REFRESH_SECRET = this._configService.get('JWT_REFRESH_SECRET', {infer: true})
		const jwtRefreshExpiresIn = this._configService.get('jwtRefreshExpiresIn', {infer: true})

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

	async resendVerificationMail(
		user: User, languageCode: LanguagesEnum
	) {
		const emailVerificationToken = nanoid()
		await this.userService.update(user.id, {
			emailVerification: {
				token: emailVerificationToken,
				validUntil: new Date((new Date()).getTime() + 1000 * 60 * 60 * 24 * 2)
			}
		})

		const url = `${environment.clientBaseUrl}/auth/verify?token=${emailVerificationToken}`;
		this.emailService.sendVerifyEmailMail(
			user,
			languageCode,
			url
		)

		return user
	}
}
