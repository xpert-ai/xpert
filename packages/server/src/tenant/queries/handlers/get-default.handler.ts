import { CACHE_MANAGER, Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { TenantService } from '../../tenant.service'
import { GetDefaultTenantQuery } from '../get-default.query'

@QueryHandler(GetDefaultTenantQuery)
export class GetDefaultTenantHandler implements IQueryHandler<GetDefaultTenantQuery> {
	protected logger = new Logger(GetDefaultTenantHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: TenantService,
		@Inject(CACHE_MANAGER) private cacheManager: Cache
	) {}

	public async execute(command: GetDefaultTenantQuery) {
		const cachekey = `tenant:default`
		let tenant = await this.cacheManager.get(cachekey)
		if (!tenant) {
			tenant = await this.service.getDefaultTenant()
			if (tenant) {
				await this.cacheManager.set(cachekey, tenant, 60 * 60 * 24 * 1000) // Cache for 24 hours
			}
		}
		return tenant
	}
}
