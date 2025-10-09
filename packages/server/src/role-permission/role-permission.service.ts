import { Injectable, BadRequestException, NotAcceptableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { FindOptionsWhere, Repository, UpdateResult, getManager } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
	RolesEnum,
	ITenant,
	IRole,
	IRolePermission,
	IImportRecord,
	IRolePermissionMigrateInput,
	PermissionsEnum,
	ID
} from '@metad/contracts';
import { environment } from '@metad/server-config';
import { TenantAwareCrudService } from './../core/crud';
import { RequestContext } from './../core/context';
import { ImportRecordUpdateOrCreateCommand } from './../export-import/import-record';
import { RolePermission } from './role-permission.entity';
import { Role } from '../role/role.entity';
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions';
import { RoleService } from '../role/role.service';

@Injectable()
export class RolePermissionService extends TenantAwareCrudService<RolePermission> {
	constructor(
		@InjectRepository(RolePermission)
		private readonly rolePermissionRepository: Repository<RolePermission>,
		private readonly roleService: RoleService,
		private readonly _commandBus: CommandBus
	) {
		super(rolePermissionRepository);
	}

	public async updatePermission(
		id: ID,
		partialEntity: QueryDeepPartialEntity<IRolePermission>
	): Promise<UpdateResult | IRolePermission> {
		try {
			const { role } = await this.repository.findOne({
				where: { id },
				relations: ['role']
			});

			if (role.name === RolesEnum.SUPER_ADMIN) {
				throw new NotAcceptableException(
					'Cannot modify Permissions for Super Admin'
				);
			}
			return await this.update(id, partialEntity);
		} catch (err /*: WriteError*/) {
			throw new BadRequestException(err.message);
		}
	}

	public async deletePermission(id: ID) {
		try {
			const { role } = await this.repository.findOne({
				where: { id },
				relations: ['role']
			});
			if (role.name === RolesEnum.SUPER_ADMIN) {
				throw new NotAcceptableException(
					'Cannot delete Permissions for Super Admin'
				);
			}
			return await this.delete(id);
		} catch (error /*: WriteError*/) {
			throw new BadRequestException(error);
		}
	}

	public async updateRoles(tenant: ITenant, role: Role) {
		const { defaultEnabledPermissions } = DEFAULT_ROLE_PERMISSIONS.find(
			(defaultRole) => role.name === defaultRole.role
		);
		for await (const permission of defaultEnabledPermissions) {
			const rolePermission = new RolePermission();
			rolePermission.roleId = role.id;
			rolePermission.permission = permission;
			rolePermission.enabled = true;
			rolePermission.tenant = tenant;
			await this.create(rolePermission);
		}
	}

	public async updateRolesAndPermissions(
		tenants: ITenant[]
	): Promise<IRolePermission[]> {
		if (!tenants.length) {
			return;
		}
		// removed permissions for all users in DEMO mode
		const deniedPermissions = [
			PermissionsEnum.ACCESS_DELETE_ACCOUNT,
			PermissionsEnum.ACCESS_DELETE_ALL_DATA
		];
		const rolesPermissions: IRolePermission[] = [];
		for await (const tenant of tenants) {
			const roles = (await this.roleService.findAll({
				where: {
					tenantId: tenant.id
				}
			})).items;
			for (const role of roles) {
				const defaultPermissions = DEFAULT_ROLE_PERMISSIONS.find(
					(defaultRole) => role.name === defaultRole.role
				);

				if (defaultPermissions) {
					const { defaultEnabledPermissions = [] } = defaultPermissions;
					for (const permission of defaultEnabledPermissions) {
						if (environment.demo ? deniedPermissions.includes(permission) : false) {
							continue
						}
						const rolePermission = new RolePermission();
						rolePermission.roleId = role.id;
						rolePermission.permission = permission;
						rolePermission.enabled = defaultEnabledPermissions.includes(permission);
						rolePermission.tenant = tenant;
						rolesPermissions.push(rolePermission);
					}
				}
			}
		}
		await this.rolePermissionRepository.save(rolesPermissions);
		return rolesPermissions;
	}

	public async migratePermissions(): Promise<IRolePermissionMigrateInput[]> {
		const permissions: IRolePermission[] = await this.rolePermissionRepository.find({
			where: {
				tenantId: RequestContext.currentTenantId()
			},
			relations: ['role']
		})
		const payload: IRolePermissionMigrateInput[] = []; 
		for await (const item of permissions) {
			const { id: sourceId, permission, role: { name } } = item;
			payload.push({
				permission,
				isImporting: true,
				sourceId,
				role: name
			})
		}
		return payload;
	}

	public async migrateImportRecord(
		permissions: IRolePermissionMigrateInput[]
	) {
		const records: IImportRecord[] = [];
		const roles: IRole[] = await getManager().getRepository(Role).findBy({
			tenantId: RequestContext.currentTenantId(),
		});
		for await (const item of permissions) {
			const { isImporting, sourceId } = item;
			if (isImporting && sourceId) {
				const { permission, role: name } = item;
				const role = roles.find((role: IRole) => role.name === name);
				const destinantion = await this.rolePermissionRepository.findOneBy({
					tenantId: RequestContext.currentTenantId(), 
					permission,
					role
				});
				if (destinantion) {
					records.push(
						await this._commandBus.execute(
							new ImportRecordUpdateOrCreateCommand({
								entityType: getManager().getRepository(RolePermission).metadata.tableName,
								sourceId,
								destinationId: destinantion.id,
								tenantId: RequestContext.currentTenantId()
							})
						)
					);
				}
			}
		}
		return records;
	}

	/**
	 * Checks if the given role permissions are valid for the current tenant.
	 * @param permissions - An array of role permissions to check.
	 * @param includeRole - Optional parameter to include role-specific checks.
	 * @returns A Promise with a boolean indicating if the role permissions are valid.
	 */
	public async checkRolePermission(
		tenantId: string,
		roleId: string,
		permissions: string[],
		includeRole = false
	): Promise<boolean> {
		// Create a query builder for the 'role_permission' entity
		const query = this.repository.createQueryBuilder('rp');
		// Add the condition for the current tenant ID
		query.where('rp.tenantId = :tenantId', { tenantId });

		// If includeRole is true, add the condition for the current role ID
		if (includeRole) {
			query.andWhere('rp.roleId = :roleId', { roleId });
		}

		// Add conditions for permissions, enabled, isActive, and isArchived
		query.andWhere('rp.permission IN (:...permissions)', { permissions });
		query.andWhere('rp.enabled = :enabled', { enabled: true });

		// Execute the query and get the count
		const count = await query.getCount();

		// Return true if the count is greater than 0, indicating valid permissions
		return count > 0;
	}
}
