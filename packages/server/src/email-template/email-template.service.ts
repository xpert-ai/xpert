import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder, WhereExpression } from 'typeorm';
import { IPagination } from '@metad/contracts';
import { CrudService, PaginationParams } from './../core/crud';
import { EmailTemplate } from './email-template.entity';
import { RequestContext } from './../core/context';

@Injectable()
export class EmailTemplateService extends CrudService<EmailTemplate> {
	constructor(
		@InjectRepository(EmailTemplate)
		private readonly emailRepository: Repository<EmailTemplate>
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
}