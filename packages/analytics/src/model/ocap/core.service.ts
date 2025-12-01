import { Agent, DataSourceFactory, DataSourceOptions, DSCacheService, DSCoreService } from '@metad/ocap-core'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { OCAP_AGENT_TOKEN, OCAP_DATASOURCES_TOKEN, OCAP_MODEL_TOKEN } from './types'

@Injectable()
export class NgmDSCoreService extends DSCoreService {
	constructor(
		@Inject(OCAP_AGENT_TOKEN)
		agent: Agent,
		@Inject(OCAP_DATASOURCES_TOKEN)
		public dataSourceFactories: { type: string; factory: DataSourceFactory }[],

		@Optional()
		@Inject(OCAP_MODEL_TOKEN)
		public models?: Array<DataSourceOptions>
	) {
		super(
			[agent],
			models,
			dataSourceFactories,
			new DSCacheService({
				maxAge: 1000 * 60 * 5,
				level: -1 // No cache
			})
		)
	}

	ngOnDestroy(): void {
		super.onDestroy()
	}
}
