import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IUser, PersonalApiKeyCreated, PersonalApiKeySummary, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash, randomBytes } from 'node:crypto'
import { t } from 'i18next'
import { IsNull, MoreThan, Repository } from 'typeorm'
import { User } from '../../user/user.entity'
import { PersonalApiKey } from './personal-api-key.entity'
import { PersonalApiKeyCreate } from './personal-api-key.schema'

export const PERSONAL_API_KEY_PREFIX = 'sk-user-'

@Injectable()
export class PersonalApiKeyService {
	constructor(
		@InjectRepository(PersonalApiKey) private readonly keys: Repository<PersonalApiKey>,
		@InjectRepository(User) private readonly users: Repository<User>
	) {}

	async list(): Promise<PersonalApiKeySummary[]> {
		const owner = this.currentOwner()
		const keys = await this.keys.find({
			where: { userId: owner.id, tenantId: owner.tenantId },
			order: { createdAt: 'DESC' }
		})
		return keys.map((key) => this.summary(key))
	}

	async create(input: PersonalApiKeyCreate): Promise<PersonalApiKeyCreated> {
		const owner = this.currentOwner()
		const token = PERSONAL_API_KEY_PREFIX + randomBytes(32).toString('base64url')
		const key = await this.keys.save(
			this.keys.create({
				userId: owner.id,
				tenantId: owner.tenantId,
				createdById: owner.id,
				name: input.name,
				tokenHash: this.hash(token),
				prefix: token.slice(0, 16),
				expiresAt: input.lifetime === 'never' ? null : new Date(Date.now() + Number(input.lifetime) * 86400000),
				lastUsedAt: null,
				revokedAt: null
			})
		)
		return { key: this.summary(key), token }
	}

	async revoke(id: string): Promise<void> {
		const owner = this.currentOwner()
		const result = await this.keys.update(
			{ id, userId: owner.id, tenantId: owner.tenantId, revokedAt: IsNull() },
			{ revokedAt: new Date() }
		)
		if (!result.affected) {
			throw new NotFoundException(
				t('server-ai:Error.PersonalApiKeyNotFound', {
					defaultValue: 'Personal API key not found or already revoked.'
				})
			)
		}
	}

	async authenticate(token: string): Promise<IUser> {
		if (!/^sk-user-[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException()
		const key = await this.keys.findOne({ where: { tokenHash: this.hash(token), revokedAt: IsNull() } })
		if (!key || !key.tenantId || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
			throw new UnauthorizedException()
		}
		// Load current roles for every request; a key must not preserve a revoked permission or deleted account.
		const user = await this.users.findOne({
			where: { id: key.userId, tenantId: key.tenantId, type: UserType.USER },
			relations: ['role', 'role.rolePermissions', 'employee']
		})
		if (!user || user.deletedAt || user.type !== UserType.USER) throw new UnauthorizedException()
		const now = new Date()
		const active = { id: key.id, revokedAt: IsNull() }
		const used = await this.keys.update(
			[
				{ ...active, expiresAt: IsNull() },
				{ ...active, expiresAt: MoreThan(now) }
			],
			{ lastUsedAt: now }
		)
		if (!used.affected) throw new UnauthorizedException()
		user.employeeId = user.employee?.id
		// Return the ordinary user identity so all domain ACLs follow the same path as an interactive login.
		return user
	}

	private currentOwner(): IUser & { id: string; tenantId: string } {
		const user = RequestContext.currentUser()
		if (
			!user?.id ||
			!user.tenantId ||
			user.type !== UserType.USER ||
			user.deletedAt ||
			RequestContext.currentApiPrincipal()
		) {
			throw new ForbiddenException(
				t('server-ai:Error.PersonalApiKeyHumanRequired', {
					defaultValue: 'Personal API keys require a human user account.'
				})
			)
		}
		return { ...user, id: user.id, tenantId: user.tenantId }
	}

	private hash(token: string): string {
		return createHash('sha256').update(token).digest('hex')
	}

	private summary(key: PersonalApiKey): PersonalApiKeySummary {
		return {
			id: key.id,
			name: key.name,
			prefix: key.prefix,
			createdAt: key.createdAt.toISOString(),
			expiresAt: key.expiresAt?.toISOString() ?? null,
			lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
			revokedAt: key.revokedAt?.toISOString() ?? null
		}
	}
}
