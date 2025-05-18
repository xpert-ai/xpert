import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder, WhereExpression } from 'typeorm';
import { IPagination } from '@metad/contracts';
import { OnEvent } from '@nestjs/event-emitter'
import chalk from 'chalk'
import { CrudService, PaginationParams } from './../core/crud';
import { EmailTemplate } from './email-template.entity';
import { RequestContext } from './../core/context';
import { TenantCreatedEvent } from '../tenant/events';
import { TenantService } from '../tenant';
import { createDefaultEmailTemplates } from './email-template.seed';

@Injectable()
export class EmailTemplateService extends CrudService<EmailTemplate> {
	constructor(
		@InjectRepository(EmailTemplate)
		private readonly emailRepository: Repository<EmailTemplate>,
		private readonly tenantService: TenantService,
	) {
		super(emailRepository);
	}

	/**
	* Get Email Templates
	* @param params 
	* @returns
	*/
	async findAll(params: PaginationParams<EmailTemplate>): Promise<IPagination<EmailTemplate>> {
		const { where, relations } = params;
		const [items, total]  = await this.emailRepository.findAndCount({
			relations: [
				...(relations ? relations : [])
			],
			where: (qb: SelectQueryBuilder<EmailTemplate>) => {
				qb.where(
					new Brackets((bck: WhereExpression) => { 
						const tenantId = RequestContext.currentTenantId();
						const { organizationId, languageCode } = where;
						if (organizationId) {
							bck.andWhere(`"${qb.alias}"."organizationId" = :organizationId`, {
								organizationId
							});
						}
						if (languageCode) {
							bck.andWhere(`"${qb.alias}"."languageCode" = :languageCode`, {
								languageCode
							});
						}
						bck.andWhere(`"${qb.alias}"."tenantId" = :tenantId`, {
							tenantId
						});
					})
				);
				qb.orWhere(
					new Brackets((bck: WhereExpression) => { 
						bck.andWhere(`"${qb.alias}"."organizationId" IS NULL`);
						bck.andWhere(`"${qb.alias}"."tenantId" IS NULL`);
					})
				)
			}
		});
		return { items, total };
	}

	@OnEvent('tenant.created')
	async handleTenantCreatedEvent(event: TenantCreatedEvent) {
		const tenant = await this.tenantService.findOne(event.tenantId)

		await createDefaultEmailTemplates(this.emailRepository.manager.connection, tenant)

		const templates = await this.emailRepository.find({
			where: {
				tenantId: tenant.id,
			}
		})

		console.log(chalk.magenta(`Seed (${templates.length}) email templates for Tenant '${event.tenantName}'`))
	}
}