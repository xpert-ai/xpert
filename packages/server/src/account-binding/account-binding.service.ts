import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { User } from '../user/user.entity'
import { ExternalIdentityBinding } from './external-identity-binding.entity'
import { UserType } from '@xpert-ai/contracts'

const RESOLVE_USER_RELATIONS = ['role', 'role.rolePermissions', 'employee'] as const
const LARK_PROVIDER = 'lark'

export interface BindUserInput {
	tenantId: string
	userId: string
	provider: string
	subjectId: string
	profile?: Record<string, any>
}

export interface ResolveUserInput {
	tenantId: string
	provider: string
	subjectId: string
}

export interface GetUserBindingInput {
	tenantId: string
	userId: string
	provider: string
}

export interface UnbindUserInput {
	tenantId: string
	userId: string
	provider: string
}

@Injectable()
export class AccountBindingService {
	constructor(
		@InjectRepository(ExternalIdentityBinding)
		private readonly externalIdentityBindingRepository: Repository<ExternalIdentityBinding>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>
	) {}

	async bindUser(input: BindUserInput): Promise<ExternalIdentityBinding> {
		const tenantId = this.requireValue(input?.tenantId, 'tenantId')
		const userId = this.requireValue(input?.userId, 'userId')
		const provider = this.requireValue(input?.provider, 'provider')
		const subjectId = this.requireValue(input?.subjectId, 'subjectId')
		const profile = normalizeProfile(input?.profile)

		return this.externalIdentityBindingRepository.manager.transaction(async (manager) => {
			const bindingRepository = manager.getRepository(ExternalIdentityBinding)
			const userRepository = manager.getRepository(User)

			const user = await userRepository.findOne({
				where: {
					id: userId,
					tenantId
				}
			})

			if (!user) {
				throw new NotFoundException(`The user '${userId}' was not found in current tenant`)
			}

			const [existingBinding, existingUserBinding] = await Promise.all([
				bindingRepository.findOne({
					where: {
						tenantId,
						provider,
						subjectId
					}
				}),
				bindingRepository.findOne({
					where: {
						tenantId,
						provider,
						userId
					}
				})
			])
			const existingBindingUser =
				existingBinding?.userId && existingBinding.userId !== userId
					? await userRepository.findOne({
							where: {
								id: existingBinding.userId,
								tenantId
							}
						})
					: null

			let binding: ExternalIdentityBinding

			if (existingBinding?.userId === userId) {
				binding = existingBinding
				if (profile !== undefined) {
					binding.profile = profile
					binding = await bindingRepository.save(binding)
				}
			} else if (existingBinding) {
				if (!this.canReclaimLarkIdentity(existingBindingUser, provider)) {
					throw new ConflictException(
						`The ${provider} identity '${subjectId}' is already bound to another user in this tenant.`
					)
				}

				if (existingUserBinding && existingUserBinding.id !== existingBinding.id) {
					existingUserBinding.subjectId = subjectId
					existingUserBinding.profile = profile ?? null
					binding = await bindingRepository.save(existingUserBinding)
					await bindingRepository.remove(existingBinding)
				} else {
					existingBinding.userId = userId
					existingBinding.user = user
					existingBinding.profile = profile ?? null
					binding = await bindingRepository.save(existingBinding)
				}
			} else if (existingUserBinding) {
				existingUserBinding.subjectId = subjectId
				existingUserBinding.profile = profile ?? null
				binding = await bindingRepository.save(existingUserBinding)
			} else {
				binding = await bindingRepository.save(
					bindingRepository.create({
						tenantId,
						tenant: { id: tenantId } as any,
						userId,
						user,
						provider,
						subjectId,
						profile: profile ?? null,
						createdById: RequestContext.currentUserId() ?? undefined,
						updatedById: RequestContext.currentUserId() ?? undefined
					})
				)
			}

			await this.syncLegacyUserIdentityForProvider(
				{
					tenantId,
					userId,
					provider,
					subjectId
				},
				userRepository
			)

			return binding
		})
	}

	async resolveUser(input: ResolveUserInput): Promise<User | null> {
		const tenantId = this.requireValue(input?.tenantId, 'tenantId')
		const provider = this.requireValue(input?.provider, 'provider')
		const subjectId = this.requireValue(input?.subjectId, 'subjectId')

		const binding = await this.externalIdentityBindingRepository.findOne({
			where: {
				tenantId,
				provider,
				subjectId
			}
		})

		if (binding?.userId) {
			const boundUser = await this.userRepository.findOne({
				where: {
					id: binding.userId,
					tenantId
				},
				relations: [...RESOLVE_USER_RELATIONS]
			})

			if (boundUser && !this.isGhostUser(boundUser)) {
				return boundUser
			}
		}
		return null
	}

	async getUserBinding(input: GetUserBindingInput): Promise<ExternalIdentityBinding | null> {
		const tenantId = this.requireValue(input?.tenantId, 'tenantId')
		const userId = this.requireValue(input?.userId, 'userId')
		const provider = this.requireValue(input?.provider, 'provider')

		return this.externalIdentityBindingRepository.findOne({
			where: {
				tenantId,
				userId,
				provider
			}
		})
	}

	async unbindUser(input: UnbindUserInput): Promise<void> {
		const tenantId = this.requireValue(input?.tenantId, 'tenantId')
		const userId = this.requireValue(input?.userId, 'userId')
		const provider = this.requireValue(input?.provider, 'provider')

		await this.externalIdentityBindingRepository.manager.transaction(async (manager) => {
			const bindingRepository = manager.getRepository(ExternalIdentityBinding)
			const userRepository = manager.getRepository(User)
			const binding = await bindingRepository.findOne({
				where: {
					tenantId,
					userId,
					provider
				}
			})

			if (!binding) {
				return
			}

			await bindingRepository.remove(binding)
			await this.clearLegacyUserIdentityForProvider(
				{
					tenantId,
					userId,
					provider,
					subjectId: binding.subjectId
				},
				userRepository
			)
		})
	}

	private async syncLegacyUserIdentityForProvider(
		input: {
			tenantId: string
			userId: string
			provider: string
			subjectId: string
		},
		userRepository: Repository<User>
	): Promise<void> {
		if (input.provider !== LARK_PROVIDER) {
			return
		}

		const user = await userRepository.findOne({
			where: {
				id: input.userId,
				tenantId: input.tenantId
			}
		})

		if (!user) {
			throw new NotFoundException(`The user '${input.userId}' was not found in current tenant`)
		}

		const occupyingUser = await userRepository.findOne({
			where: {
				tenantId: input.tenantId,
				thirdPartyId: input.subjectId
			}
		})

		if (!occupyingUser) {
			user.thirdPartyId = input.subjectId
			await userRepository.save(user)
			return
		}

		if (occupyingUser.id === user.id) {
			return
		}

		if (this.canReclaimLarkIdentity(occupyingUser, input.provider)) {
			occupyingUser.thirdPartyId = null
			await userRepository.save(occupyingUser)
			user.thirdPartyId = input.subjectId
			await userRepository.save(user)
			return
		}

		throw new ConflictException(
			`The lark identity '${input.subjectId}' is already occupied by another user in this tenant.`
		)
	}

	private async clearLegacyUserIdentityForProvider(
		input: {
			tenantId: string
			userId: string
			provider: string
			subjectId: string
		},
		userRepository: Repository<User>
	): Promise<void> {
		if (input.provider !== LARK_PROVIDER) {
			return
		}

		const user = await userRepository.findOne({
			where: {
				id: input.userId,
				tenantId: input.tenantId
			}
		})

		if (!user || user.thirdPartyId !== input.subjectId) {
			return
		}

		user.thirdPartyId = null
		await userRepository.save(user)
	}

	private requireValue(value: string | undefined, field: string): string {
		if (typeof value !== 'string' || value.trim().length === 0) {
			throw new BadRequestException(`${field} is required`)
		}

		return value.trim()
	}

	private isGhostUser(user?: Pick<User, 'hash'> | null): boolean {
		return typeof user?.hash !== 'string' || user.hash.trim().length === 0
	}

	private canReclaimLarkIdentity(
		user: Pick<User, 'type' | 'hash'> | null,
		provider: string
	): boolean {
		if (provider !== LARK_PROVIDER) {
			return false
		}

		return !user || user.type === UserType.COMMUNICATION || this.isGhostUser(user)
	}
}

function normalizeProfile(profile?: Record<string, any>) {
	if (profile === undefined) {
		return undefined
	}

	return profile ?? null
}
