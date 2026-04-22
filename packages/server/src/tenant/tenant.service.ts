import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	ITenantCreateInput,
	RolesEnum,
	IUser,
	FileStorageProviderEnum,
	DEFAULT_TENANT,
	IOrganizationCreateInput
} from '@xpert-ai/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter'
import { CrudService } from '../core/crud/crud.service';
import { Tenant } from './tenant.entity';
import { UserService } from '../user/user.service';
import { TenantRoleBulkCreateCommand } from '../role/commands/tenant-role-bulk-create.command';
import { TenantFeatureOrganizationCreateCommand } from './commands/tenant-feature-organization.create.command';
import { Role } from './../core/entities/internal';
import { TenantSettingSaveCommand } from './tenant-setting/commands';
import { OrganizationCreateCommand } from '../organization/commands';
import { EVENT_TENANT_CREATED, TenantCreatedEvent } from './events';
import { normalizeTenantSubdomain } from './tenant-subdomain.util';


@Injectable()
export class TenantService extends CrudService<Tenant> {
	constructor(
		@InjectRepository(Tenant)
		readonly tenantRepository: Repository<Tenant>,
		@Inject(forwardRef(() => UserService))
		private readonly userService: UserService,
		@InjectRepository(Role)
		private readonly roleRepository: Repository<Role>,
		private readonly commandBus: CommandBus,
		private readonly eventEmitter: EventEmitter2
	) {
		super(tenantRepository);
	}

	public async onboardTenant(
		entity: ITenantCreateInput,
		user: IUser,
		options?: { skipSubdomainPreparation?: boolean }
	): Promise<Tenant> {
		const preparedEntity = options?.skipSubdomainPreparation
			? entity
			: await this.prepareTenantCreateInput(entity)
		const { isImporting = false, sourceId = null, defaultOrganization } = preparedEntity;

		//1. Create Tenant of user.
		const tenant = await this.create({...preparedEntity, createdBy: user});

		//2. Create Role/Permissions to relative tenants.
		await this.commandBus.execute(
			new TenantRoleBulkCreateCommand([tenant])
		);

		//3. Create Enabled/Disabled features for relative tenants.
		await this.commandBus.execute(
			new TenantFeatureOrganizationCreateCommand([tenant])
		);

		//4. Create tenant default file stoage setting (LOCAL)
		const tenantId = tenant.id;
		await this.commandBus.execute(
			new TenantSettingSaveCommand({
					fileStorageProvider: FileStorageProviderEnum.LOCAL,
				},
				tenantId
			)
		);

		//4. Find SUPER_ADMIN role to relative tenant.
		const role = await this.roleRepository.findOneBy({
			tenantId,
			name: RolesEnum.SUPER_ADMIN
		});
		if (!role) {
			throw new InternalServerErrorException(`Cannot find ${RolesEnum.SUPER_ADMIN} role for tenant ${tenant.name}`);
		}

		//5. Assign tenant and role to user.
		await this.userService.update(user.id, {
			tenant: {
				id: tenant.id
			},
			role: {
				id: role.id
			}
		});

		// //6. Create Import Records while migrating for relative tenant.
		// if (isImporting && sourceId) {
		// 	const { sourceId, userSourceId } = entity;
		// 	await this.commandBus.execute(
		// 		new ImportRecordUpdateOrCreateCommand({
		// 			entityType: getManager().getRepository(Tenant).metadata.tableName,
		// 			sourceId,
		// 			destinationId: tenant.id,
		// 			tenantId: tenant.id
		// 		})
		// 	);
		// 	if (userSourceId) {
		// 		await this.commandBus.execute(
		// 			new ImportRecordUpdateOrCreateCommand({
		// 				entityType: getManager().getRepository(User).metadata.tableName,
		// 				sourceId: userSourceId,
		// 				destinationId: user.id
		// 			}, {
		// 				tenantId: tenant.id
		// 			})
		// 		);
		// 	}
		// }
		
		//7. Create default organization for tenant.
		if (defaultOrganization) {
			const organization = await this.commandBus.execute(new OrganizationCreateCommand(
				{...defaultOrganization, tenant, tenantId} as IOrganizationCreateInput))
			tenant.organizations = [organization]
		}

		//8. Apply tenant created event
		this.eventEmitter.emit(
			EVENT_TENANT_CREATED,
			new TenantCreatedEvent(tenant.id, tenant.name),
		  );
		  
		// const _tenant = this.publisher.mergeObjectContext(tenant)
		// _tenant.afterCreated()
		// _tenant.commit()

		return tenant;
	}

	// public async generateDemo(id: string): Promise<Tenant> {
	// 	const tenant = this.publisher.mergeObjectContext(await this.findOne(id))

	// 	tenant.apply(new TenantCreatedEvent(tenant.id))
	// 	tenant.commit()

	// 	return tenant
	// }

	public async getDefaultTenant() {
		return await this.findOne({
			where: {
				name: DEFAULT_TENANT
			}
		})
	}

	public async prepareTenantCreateInput(entity: ITenantCreateInput): Promise<ITenantCreateInput> {
		const preparedEntity: ITenantCreateInput = { ...entity }
		const subdomain = this.resolveCreateSubdomain(entity)

		await this.ensureSubdomainUnique(subdomain)

		if (subdomain) {
			preparedEntity.subdomain = subdomain
		} else {
			delete preparedEntity.subdomain
		}

		return preparedEntity
	}

	public async prepareTenantUpdateInput(
		tenantId: string,
		entity: ITenantCreateInput
	): Promise<ITenantCreateInput> {
		const preparedEntity: ITenantCreateInput = { ...entity }

		if (typeof entity.subdomain !== 'string' || entity.subdomain.trim().length === 0) {
			delete preparedEntity.subdomain
			return preparedEntity
		}

		const normalizedSubdomain = normalizeTenantSubdomain(entity.subdomain)
		if (!normalizedSubdomain) {
			throw new BadRequestException('Tenant subdomain is invalid')
		}

		await this.ensureSubdomainUnique(normalizedSubdomain, tenantId)
		preparedEntity.subdomain = normalizedSubdomain

		return preparedEntity
	}

	private resolveCreateSubdomain(entity: ITenantCreateInput): string | null {
		if (typeof entity.subdomain === 'string' && entity.subdomain.trim().length > 0) {
			const normalizedSubdomain = normalizeTenantSubdomain(entity.subdomain)
			if (!normalizedSubdomain) {
				throw new BadRequestException('Tenant subdomain is invalid')
			}

			return normalizedSubdomain
		}

		return normalizeTenantSubdomain(entity.name)
	}

	private async ensureSubdomainUnique(subdomain: string | null, currentTenantId?: string) {
		if (!subdomain) {
			return
		}

		const existing = await this.tenantRepository.findOneBy({ subdomain })
		if (existing && existing.id !== currentTenantId) {
			throw new BadRequestException('Tenant subdomain already exists')
		}
	}
}
