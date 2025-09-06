import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder, WhereExpression, WhereExpressionBuilder } from 'typeorm';
import { IEmailTemplate, IPagination } from '@metad/contracts';
import { OnEvent } from '@nestjs/event-emitter'
import chalk from 'chalk'
import { CrudService, PaginationParams } from './../core/crud';
import { EmailTemplate } from './email-template.entity';
import { RequestContext } from './../core/context';
import { TenantCreatedEvent } from '../tenant/events';
import { TenantService } from '../tenant';
import { createDefaultEmailTemplates } from './email-template.seed';
import { isNotEmpty } from '@metad/server-common';
import { BaseQueryDTO } from '../core/dto';

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
	async findAll(params: BaseQueryDTO<EmailTemplate>): Promise<IPagination<IEmailTemplate>> {
		const query = this.repository.createQueryBuilder('email_template');
		query.setFindOptions({
			select: {
				organization: {
					id: true,
					name: true,
					brandColor: true
				}
			},
			...(params && params.relations
				? {
						relations: params.relations
				  }
				: {}),
			...(params && params.order
				? {
						order: params.order
				  }
				: {})
		});
		query.where((qb: SelectQueryBuilder<EmailTemplate>) => {
			qb.where(
				new Brackets((web: WhereExpressionBuilder) => {
					const { tenantId, organizationId, languageCode } = params.where;
					if (isNotEmpty(tenantId)) {
						web.andWhere(`"${qb.alias}"."tenantId" = :tenantId`, {
							tenantId: RequestContext.currentTenantId()
						});
					}
					if (isNotEmpty(organizationId)) {
						web.andWhere(`"${qb.alias}"."organizationId" = :organizationId`, {
							organizationId
						});
					}
					if (isNotEmpty(languageCode)) {
						web.andWhere(`"${qb.alias}"."languageCode" = :languageCode`, {
							languageCode
						});
					}
				})
			);
			qb.orWhere(
				new Brackets((web: WhereExpressionBuilder) => {
					web.andWhere(`"${qb.alias}"."organizationId" IS NULL`);
					web.andWhere(`"${qb.alias}"."tenantId" IS NULL`);
				})
			);
		});
		const [items, total] = await query.getManyAndCount();
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