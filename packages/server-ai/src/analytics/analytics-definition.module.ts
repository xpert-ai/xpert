import { AnalyticsAuthoringService } from './analytics-authoring.service'
import { Xpert } from '../xpert/xpert.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalyticsModule, Integration, UserOrganizationModule } from '@xpert-ai/server-core'
import { ArtifactsModule } from '../artifacts'
import { AnalyticsDefinition, AnalyticsDefinitionVersion } from './analytics-definition.entity'
import { AnalyticsDefinitionService } from './analytics-definition.service'
import { AnalyticsDefinitionController } from './analytics-definition.controller'
import {
    AnalyticsArtifactSources,
    ListAnalyticsSourcesHandler,
    ResolveAnalyticsSourceHandler
} from './analytics-sources.handlers'
@Module({
    imports: [
        CqrsModule,
        XpertWorkspaceModule,
        AnalyticsModule,
        UserOrganizationModule,
        ArtifactsModule,
        TypeOrmModule.forFeature([AnalyticsDefinition, AnalyticsDefinitionVersion, Xpert, XpertToolset, Integration])
    ],
    providers: [
        AnalyticsDefinitionService,
        AnalyticsAuthoringService,
        AnalyticsArtifactSources,
        ListAnalyticsSourcesHandler,
        ResolveAnalyticsSourceHandler
    ],
    controllers: [AnalyticsDefinitionController]
})
export class AnalyticsDefinitionModule {}
