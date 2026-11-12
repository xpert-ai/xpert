import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CodingDelivery, CodingDeliveryWork } from './entities'
import { CodingDeliveryStore } from './store'
import { CodingEvidenceService } from './evidence'
import { CodingDeliveryService } from './delivery.service'
import { CodingDeliveryMiddleware } from './middleware'
import { CodingPipelineContribution } from './pipeline'
import { adapters } from './adapters'
import { CodingDeploymentService } from './deployment'
import { CodingDeploymentRequestResolver } from './deployment-request'
import { CodingGitService } from './git'

const entities = [CodingDelivery, CodingDeliveryWork]
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(entities)], entities,
  providers: [CodingDeliveryStore, CodingEvidenceService, CodingDeliveryService,
    CodingDeliveryMiddleware, CodingPipelineContribution, CodingDeploymentRequestResolver, CodingDeploymentService, CodingGitService, ...adapters]
})
export class CodingProjectModule {}
