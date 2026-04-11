import { Inject, Injectable, OnDestroy, Optional } from '@angular/core'
import { Agent, DataSourceFactory, DataSourceOptions, DSCoreService } from '@xpert-ai/ocap-core'
import { NgmDSCacheService } from './agent.service'
import { OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, OCAP_MODEL_TOKEN } from './types'

@Injectable()
export class NgmDSCoreService extends DSCoreService implements OnDestroy {
  constructor(
    @Inject(OCAP_AGENT_TOKEN)
    public override agents: Array<Agent>,
    @Optional()
    @Inject(OCAP_MODEL_TOKEN)
    public models?: Array<DataSourceOptions>,
    @Optional()
    @Inject(OCAP_DATASOURCE_TOKEN)
    public dataSourceFactory?: Array<{ type: string; factory: DataSourceFactory }>,
    @Optional()
    cacheService?: NgmDSCacheService
  ) {
    super(agents, models, dataSourceFactory, cacheService)
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
}
