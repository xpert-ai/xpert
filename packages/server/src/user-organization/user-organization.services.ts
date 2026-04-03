import { IUser, IUserOrganization, RolesEnum } from '@metad/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareCrudService } from './../core/crud';
import { UserOrganizationCreatedEvent, EVENT_USER_ORGANIZATION_CREATED } from '../user/events';
import { Organization, UserOrganization } from './../core/entities/internal';

type AddUserToOrganizationOptions = {
	bootstrapPersonalWorkspace?: boolean
	emitBootstrapEvent?: boolean
}

@Injectable()
export class UserOrganizationService extends TenantAwareCrudService<UserOrganization> {
	constructor(
		@InjectRepository(UserOrganization)
		private readonly userOrganizationRepository: Repository<UserOrganization>,

		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,
		private readonly eventEmitter: EventEmitter2
	) {
		super(userOrganizationRepository);
	}

	async addUserToOrganization(
		user: IUser,
		organizationId: string,
		options: AddUserToOrganizationOptions = {}
	): Promise<IUserOrganization | IUserOrganization[]> {
		const roleName: string = user.role?.name;
		const bootstrapPersonalWorkspace = options.bootstrapPersonalWorkspace ?? true;
		const emitBootstrapEvent = options.emitBootstrapEvent ?? true;

		if (roleName === RolesEnum.SUPER_ADMIN) {
			// Ensure tenant is available before accessing tenant.id
			if (!user.tenant?.id) {
				throw new Error('User tenant is required for SUPER_ADMIN role')
			}
			return this._addUserToAllOrganizations(user.id, user.tenant.id, {
				bootstrapPersonalWorkspace,
				emitBootstrapEvent
			});
		}

		return await this.ensureMembership({
			organizationId,
			tenantId: user.tenantId,
			userId: user.id,
			bootstrapPersonalWorkspace,
			emitBootstrapEvent
		});
	}

	async ensureMembership({
		organizationId,
		tenantId,
		userId,
		bootstrapPersonalWorkspace = true,
		emitBootstrapEvent = true
	}: {
		organizationId: string
		tenantId: string
		userId: string
		bootstrapPersonalWorkspace?: boolean
		emitBootstrapEvent?: boolean
	}): Promise<IUserOrganization> {
		const existing = await this.userOrganizationRepository.findOne({
			where: {
				organizationId,
				tenantId,
				userId
			}
		});

		if (existing) {
			return existing;
		}

		const entity: IUserOrganization = new UserOrganization();
		entity.organizationId = organizationId;
		entity.tenantId = tenantId;
		entity.userId = userId;
		const membership = await this.create(entity);

		if (emitBootstrapEvent) {
			this.eventEmitter.emit(
				EVENT_USER_ORGANIZATION_CREATED,
				new UserOrganizationCreatedEvent(
					tenantId,
					organizationId,
					userId,
					bootstrapPersonalWorkspace
				)
			);
		}

		return membership;
	}

	async findUserIdsByOrganization(organizationId: string): Promise<string[]> {
		const memberships = await this.userOrganizationRepository.find({
			select: ['userId'],
			where: { organizationId }
		});

		return memberships.map(({ userId }) => userId);
	}

	private async _addUserToAllOrganizations(
		userId: string,
		tenantId: string,
		options: AddUserToOrganizationOptions
	): Promise<IUserOrganization[]> {
		const organizations = await this.organizationRepository.find({
			select: ['id'],
			where: { tenant: { id: tenantId } },
			relations: ['tenant']
		});
		const memberships: IUserOrganization[] = [];

		for await (const organization of organizations) {
			memberships.push(
				await this.ensureMembership({
					organizationId: organization.id,
					tenantId,
					userId,
					bootstrapPersonalWorkspace: options.bootstrapPersonalWorkspace,
					emitBootstrapEvent: options.emitBootstrapEvent
				})
			);
		}

		return memberships;
	}
}
