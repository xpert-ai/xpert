import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, FindOptionsWhere } from 'typeorm'
import { IRole, ITenant, RolesEnum, IRoleMigrateInput, InviteStatusEnum } from '@metad/contracts'
import { TenantAwareCrudService } from './../core/crud'
import { Role } from './role.entity'
import { RequestContext } from './../core/context'
import { Invite, User } from '../core/entities/internal'

@Injectable()
export class RoleService extends TenantAwareCrudService<Role> {
	constructor(
		@InjectRepository(Role)
		private readonly roleRepository: Repository<Role>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		@InjectRepository(Invite)
		private readonly inviteRepository: Repository<Invite>
	) {
		super(roleRepository)
	}

	private currentTenantId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required for role access.')
		}

		return tenantId
	}

	private async findRoleForMutation(criteria: string | number | FindOptionsWhere<Role>) {
		const tenantId = this.currentTenantId()
		const where =
			typeof criteria === 'object'
				? ({
						...criteria,
						tenantId
					} as FindOptionsWhere<Role>)
				: ({
						id: String(criteria),
						tenantId
					} as FindOptionsWhere<Role>)

		const role = await this.roleRepository.findOne({
			where
		})

		if (!role) {
			throw new BadRequestException('The requested role was not found in the current tenant.')
		}

		return role
	}

	override async create(entity: Partial<Role>, ...options: any[]) {
		return super.create(
			{
				...entity,
				isSystem: false
			},
			...options
		)
	}

	override async update(id: string | number, entity: Partial<Role>, ...options: any[]) {
		const role = await this.findRoleForMutation(id)

		if (role.isSystem && entity.name && entity.name !== role.name) {
			throw new BadRequestException('System roles cannot be renamed.')
		}

		if (entity.isSystem !== undefined && entity.isSystem !== role.isSystem) {
			throw new BadRequestException('System role flags cannot be modified.')
		}

		return super.update(
			id,
			{
				...entity,
				isSystem: role.isSystem
			},
			...options
		)
	}

	override async delete(criteria: string | FindOptionsWhere<Role>, options?: any) {
		const role = await this.findRoleForMutation(criteria)

		if (role.isSystem) {
			throw new BadRequestException('System roles cannot be deleted.')
		}

		const boundUsers = await this.userRepository.count({
			where: {
				tenantId: role.tenantId,
				roleId: role.id
			}
		})

		if (boundUsers > 0) {
			throw new BadRequestException('Cannot delete a role that is assigned to users.')
		}

		const pendingInvites = await this.inviteRepository.count({
			where: {
				tenantId: role.tenantId,
				roleId: role.id,
				status: InviteStatusEnum.INVITED
			}
		})

		if (pendingInvites > 0) {
			throw new BadRequestException('Cannot delete a role that is referenced by pending invites.')
		}

		return super.delete(criteria, options)
	}

	async createBulk(tenants: ITenant[]): Promise<IRole[]> {
		const roles: IRole[] = []
		const rolesNames = Object.values(RolesEnum)
		
		for await (const tenant of tenants) {
			for await (const name of rolesNames) {
				const role = new Role()
				role.name = name
				role.tenant = tenant
				roles.push(role)
			}
		}
		await this.roleRepository.save(roles)
		return roles
	}

	async migrateRoles(): Promise<IRoleMigrateInput[]> {
		const roles: IRole[] = await this.repository.find({
			where: {
				tenantId: RequestContext.currentTenantId()
			}
		});
		const payload: IRoleMigrateInput[] = []
		for await (const item of roles) {
			const { id: sourceId, name } = item
			payload.push({
				name,
				isImporting: true,
				sourceId 
			})
		}
		return payload
	}

	// async migrateImportRecord(roles: IRoleMigrateInput[]) {
	// 	const records: IImportRecord[] = [];
	// 	for await (const item of roles) {
	// 		const { isImporting, sourceId, name } = item;
	// 		if (isImporting && sourceId) {
	// 			const destinantion = await this.roleRepository.findOne({
	// 				where: { tenantId: RequestContext.currentTenantId(), name },
	// 				order: { createdAt: 'DESC' }
	// 			});
	// 			if (destinantion) {
	// 				records.push(
	// 					await this._commandBus.execute(
	// 						new ImportRecordUpdateOrCreateCommand({
	// 							entityType: this.repository.metadata.tableName,
	// 							sourceId,
	// 							destinationId: destinantion.id,
	// 							tenantId: RequestContext.currentTenantId()
	// 						})
	// 					)
	// 				);
	// 			}
	// 		}
	// 	}
	// 	return records;
	// }
}
