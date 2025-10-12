import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { Repository, FindOneOptions } from 'typeorm';
import { TenantAwareCrudService } from './../core/crud';
import { Organization } from './organization.entity';
import { OrganizationDemoCommand } from './commands';
import { OrgGenerateDemoOptions } from '@metad/contracts';

@Injectable()
export class OrganizationService extends TenantAwareCrudService<Organization> {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,

		private readonly commandBus: CommandBus
	) {
		super(organizationRepository);
	}

	/**
	 * Returns the organization based on the public link irrespective of the tenant.
	 */
	public async findByPublicLink(
		profile_link: string,
		select?: string,
		relation?: string
	): Promise<Organization> {
		const findObj: FindOneOptions<Organization> = {
			where: { profile_link }
		};

		if (select) {
			findObj['select'] = JSON.parse(select);
			findObj['relations'] = JSON.parse(relation);
		}

		return await this.organizationRepository.findOne(
			findObj
		);
	}

	/**
	 * Generate demo data for the organization (e.g. demo projects, demo dashboards, etc.)
	 */
	public async generateDemo(id: string, options: OrgGenerateDemoOptions) {
		const organization = await this.organizationRepository.findOneBy({ id: id});

		await this.commandBus.execute(
			new OrganizationDemoCommand({
				id,
				options
			})
		)

		organization.createdDemo = true;
		return await this.organizationRepository.save(organization);
	}
}
