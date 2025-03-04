import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, InsertResult, SelectQueryBuilder, Like, Brackets, WhereExpressionBuilder } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { environment as env } from '@metad/server-config'
import { User } from './user.entity';
import { TenantAwareCrudService } from './../core/crud';
import { IUser, LanguagesEnum, PermissionsEnum, RolesEnum } from '@metad/contracts';
import { RequestContext } from '../core/context';
import { EmailVerification } from './email-verification/email-verification.entity';
import { UserPublicDTO } from './dto';

@Injectable()
export class UserService extends TenantAwareCrudService<User> {
	constructor(
		@InjectRepository(User)
		userRepository: Repository<User>,
		@InjectRepository(EmailVerification)
		public emailVerificationRepository: Repository<EmailVerification>
	) {
		super(userRepository);
	}

	async getUserByEmail(email: string): Promise<User> {
		const user = await this.repository
			.createQueryBuilder('user')
			.where('user.email = :email', { email })
			.getOne();
		return user;
	}

	async getUserIdByEmail(email: string): Promise<string> {
		const user = await this.getUserByEmail(email);
		const userId = user.id;
		return userId;
	}

	async getIfExistsUser(user: IUser): Promise<IUser> {
		let _user: IUser = null
		if (user.email) {
			const userExists = await this.findOneOrFail({where: {email: user.email}})
			if (userExists.success) {
				_user = userExists.record
			}
		}
		
		if (!_user && user.mobile) {
			const userExists = await this.findOneOrFail({where: {mobile: user.mobile}})
			if (userExists.success) {
				_user = userExists.record
			}
		}
		if (!_user && user.thirdPartyId) {
			const userExists = await this.findOneOrFail({where: {thirdPartyId: user.thirdPartyId}})
			if (userExists.success) {
				_user = userExists.record
			}
		}
		if (!_user && user.username) {
			const userExists = await this.findOneOrFail({where: {username: user.username}})
			if (userExists.success) {
				_user = userExists.record
			}
		}
		
		return _user
	}

	async checkIfExistsEmail(email: string): Promise<boolean> {
		const count = await this.repository
			.createQueryBuilder('user')
			.where('user.email = :email', { email })
			.getCount();
		return count > 0;
	}

	async checkIfExists(id: string): Promise<boolean> {
		const count = await this.repository
			.createQueryBuilder('user')
			.where('user.id = :id', { id })
			.getCount();
		return count > 0;
	}

	async checkIfExistsThirdParty(thirdPartyId: string): Promise<boolean> {
		const count = await this.repository
			.createQueryBuilder('user')
			.where('user.thirdPartyId = :thirdPartyId', { thirdPartyId })
			.getCount();
		return count > 0;
	}

	async getIfExists(id: string): Promise<User> {
		return await this.repository
			.createQueryBuilder('user')
			.where('user.id = :id', { id })
			.leftJoinAndSelect('user.role', 'role')
			.getOne();
	}

	async getIfExistsThirdParty(thirdPartyId: string): Promise<User> {
		return await this.repository
			.createQueryBuilder('user')
			.where('user.thirdPartyId = :thirdPartyId', { thirdPartyId })
			.leftJoinAndSelect('user.role', 'role')
			.getOne();
	}

	async createOne(user: User): Promise<InsertResult> {
		return await this.repository.insert(user);
	}

	async changePassword(id: string, hash: string) {
		const user = await this.findOne(id);
		user.hash = hash;
		return await this.repository.save(user);
	}

	async resetPassword(id: string, hash: string, password: string) {
		if (RequestContext.currentUserId() !== id) {
			throw new ForbiddenException()
		}

		const user = await this.findOne(id, {relations: ['role']});
		if (!user) {
			throw new NotFoundException(`The user was not found`);
		}
		
		if (user.hash && !(await bcrypt.compare(hash, user.hash))) {
			throw new ForbiddenException(`Current password not match`)
		}

		user.hash = await this.getPasswordHash(password)

		return await this.repository.save(user)
	}

	/*
	 * Update user profile
	 */
	async updateProfile(
		id: string | number,
		partialEntity: User,
		...options: any[]
	): Promise<User> {

		/**
		 * If user has only own profile edit permission
		 */
		if (
			RequestContext.hasPermission(PermissionsEnum.PROFILE_EDIT) &&
			!RequestContext.hasPermission(PermissionsEnum.ORG_USERS_EDIT)
		) {
			if (RequestContext.currentUserId() !== id) {
				throw new ForbiddenException();
			}
		}
		try {
			const user = await this.findOne(id, {relations: ['role']});
			if (!user) {
				throw new NotFoundException(`The user was not found`);
			}
	
			/**
			 * If user try to update Super Admin without permission
			 */
			if (user.role.name === RolesEnum.SUPER_ADMIN) {
				if (!RequestContext.hasPermission(PermissionsEnum.SUPER_ADMIN_EDIT)) {
					throw new ForbiddenException();
				}
			}

			if (partialEntity['hash']) {
				partialEntity['hash'] = await this.getPasswordHash(partialEntity['hash']);
			}

			return await this.repository.save(partialEntity);
		} catch (err) {
			throw new NotFoundException(`The record was not found`, err);
		}
	}

	async getAdminUsers(tenantId: string): Promise<User[]> {
		const roleNames =[RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN];		
		return await this.repository.find({
			join: {
				alias: 'user',
				leftJoin: {
					role: 'user.role'
				},
			},
			where: (qb: SelectQueryBuilder<User>) => {
					qb.andWhere(`"${qb.alias}"."tenantId" = :tenantId`, {
						tenantId
					});
					qb.andWhere(`role.name IN (:...roleNames)`, {
						roleNames
					});
				}
			});		
	}

	/*
	 * Update user preferred language
	 */
	async updatePreferredLanguage(
		id: string | number,
		preferredLanguage: LanguagesEnum
	): Promise<IUser> {
		try {
			const user = await this.findOne(id);
			if (!user) {
				throw new NotFoundException(`The user was not found`);
			}
			user.preferredLanguage = preferredLanguage;
			return await this.repository.save(user);
		} catch (err) {
			throw new NotFoundException(`The record was not found`, err);
		}
	}

	async verifyEmail(token: string): Promise<void> {
		const emailVerification = await this.emailVerificationRepository.findOne({
			where: { token },
			relations: ['user']
		})

		if (
			emailVerification !== null
			&& emailVerification.validUntil > new Date()
		) {
			await this.update(emailVerification.userId, {emailVerified: true})
		} else {
			Logger.log(`Verify email called with invalid email token ${token}`);
			throw new NotFoundException();
		}
	}

	async deleteEmailVarification(id: string) {
		this.emailVerificationRepository.delete(id)
	}

	async search(text: string, organizationId: string) {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()
		const condition = Like(`%${text.split('%').join('')}%`)

		if (RequestContext.hasRole(RolesEnum.TRIAL)) {
			return this.findAll({ where: {id: userId} }).then((result) => ({
				...result,
				items: result.items.map((item) => new UserPublicDTO(item))
			}))
		} else if (organizationId) {
			const query = this.repository
				.createQueryBuilder('user')
				.leftJoinAndSelect('user.organizations', 'organizations')
				.leftJoinAndSelect('organizations.organization', 'organization')
				.where(new Brackets((qb: WhereExpressionBuilder) => { 
					qb.orWhere('user.email LIKE :searchText')
					qb.orWhere('user.username LIKE :searchText')
					qb.orWhere('user.firstName LIKE :searchText')
					qb.orWhere('user.lastName LIKE :searchText')
				}), { searchText: `%${text.split('%').join('')}%` })
				.andWhere('user.tenantId = :tenantId', { tenantId })
				.andWhere('organization.id = :organizationId', { organizationId })
			
			return query.getManyAndCount().then(([items, total]) => ({
				total,
				items: items.map((item) => new UserPublicDTO(item))
			}))
		}

		const where: any[] = [{
			email: condition
		}, {
			firstName: condition
		}, {
			lastName: condition
		}]
		return this.findAll({ where }).then((result) => ({
			...result,
			items: result.items.map((item) => new UserPublicDTO(item))
		}))
	}

	private async getPasswordHash(password: string): Promise<string> {
		return bcrypt.hash(password, env.USER_PASSWORD_BCRYPT_SALT_ROUNDS);
	}
}
