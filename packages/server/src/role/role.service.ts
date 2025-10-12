import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IRole, ITenant, RolesEnum, IRoleMigrateInput, IImportRecord } from '@metad/contracts';
import { TenantAwareCrudService } from './../core/crud';
import { Role } from './role.entity';
import { RequestContext } from './../core/context';

@Injectable()
export class RoleService extends TenantAwareCrudService<Role> {
	constructor(
		@InjectRepository(Role)
		private readonly roleRepository: Repository<Role>,
	) {
		super(roleRepository);
	}

	async createBulk(tenants: ITenant[]): Promise<IRole[]> {
		const roles: IRole[] = [];
		const rolesNames = Object.values(RolesEnum);
		
		for await (const tenant of tenants) {
			for await (const name of rolesNames) {
				const role = new Role();
				role.name = name;
				role.tenant = tenant;
				roles.push(role);
			}
		}
		await this.roleRepository.save(roles);
		return roles;
	}

	async migrateRoles(): Promise<IRoleMigrateInput[]> {
		const roles: IRole[] = await this.repository.find({
			where: {
				tenantId: RequestContext.currentTenantId()
			}
		});
		const payload: IRoleMigrateInput[] = []; 
		for await (const item of roles) {
			const { id: sourceId, name } = item;
			payload.push({
				name,
				isImporting: true,
				sourceId 
			})
		}
		return payload;
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
