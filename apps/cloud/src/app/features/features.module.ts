import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { PacAuthModule } from '@metad/cloud/auth'
import { NgmFormlyModule, provideFormly, provideFormlyMaterial } from '@metad/formly'
import { registerEChartsThemes } from '@metad/material-theme'
import { NgmDrawerContentComponent, NgmDrawerTriggerComponent, NgmTableComponent, ResizerModule } from '@metad/ocap-angular/common'
import { NgmCopilotContextService, NgmCopilotContextToken, NgmCopilotEngineService, NgmCopilotService } from '@metad/copilot-angular'
import {
  DensityDirective,
  NgmAgentService,
  NgmDSCacheService,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN
} from '@metad/ocap-angular/core'
import { NGM_WASM_AGENT_WORKER, WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { DataSource, Type } from '@metad/ocap-core'
import { NgmCopilotChatComponent } from '@metad/copilot-angular'
import { NX_STORY_FEED, NX_STORY_MODEL, NX_STORY_STORE } from '@metad/story/core'
import { environment } from '../../environments/environment'
import { DirtyCheckGuard, LocalAgent, ServerAgent, ServerSocketAgent, provideLogger } from '../@core/index'
import { AssetsComponent } from '../@shared/assets/assets.component'
import { NotificationComponent, TuneComponent } from '../@theme'
import { HeaderUserComponent, ProjectSelectorComponent, WorkspaceSelectorComponent } from '../@theme/header'
import { PACThemeModule } from '../@theme/theme.module'
import { StoryFeedService, StoryModelService, StoryStoreService } from '../services/index'
import { FeaturesRoutingModule } from './features-routing.module'
import { FeaturesComponent } from './features.component'
import { provideCheckpointSaver, provideCommandFewShotPrompt, provideDimensionMemberRetriever } from '../@core/copilot'
import { NgmDrawerComponent, NgmDrawerContainerComponent } from '@metad/ocap-angular/common'
import { NgxEchartsModule } from 'ngx-echarts'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { EmojiAvatarComponent } from '../@shared/avatar'
import { CdkMenuModule } from '@angular/cdk/menu'
import { PACCopilotService } from './services'
import { MaterialModule } from '../@shared/material.module'
import { SharedModule } from '../@shared/shared.module'

registerEChartsThemes()

@NgModule({
  declarations: [FeaturesComponent],
  imports: [
    CommonModule,
    FeaturesRoutingModule,
    CdkMenuModule,
    MaterialModule,
    SharedModule,
    PacAuthModule,
    PACThemeModule,
    AssetsComponent,
    ProjectSelectorComponent,
    DensityDirective,

    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    MonacoEditorModule.forRoot(), // chatbi

    // Formly
    NgmFormlyModule,

    NgmCopilotChatComponent,
    NgmDrawerTriggerComponent,
    NgmDrawerContainerComponent,
    NgmDrawerComponent,
    NgmDrawerContentComponent,
    NgmDrawerContainerComponent,
    ResizerModule,
    NgmTableComponent,
    NotificationComponent,
    TuneComponent,
    EmojiAvatarComponent,
    HeaderUserComponent,
    WorkspaceSelectorComponent
  ],
  providers: [
    DirtyCheckGuard,
    NgmAgentService,
    NgmDSCacheService,
    provideLogger(),
    provideFormly(),
    provideFormlyMaterial(),
    {
      provide: NGM_WASM_AGENT_WORKER,
      useValue: '/assets/ocap-agent-data-init.worker.js'
    },
    WasmAgentService,
    {
      provide: OCAP_AGENT_TOKEN,
      useExisting: WasmAgentService,
      multi: true
    },
    ...(environment.enableLocalAgent
      ? [
          LocalAgent,
          {
            provide: OCAP_AGENT_TOKEN,
            useExisting: LocalAgent,
            multi: true
          }
        ]
      : []),
    ServerAgent,
    ServerSocketAgent,
    {
      provide: OCAP_AGENT_TOKEN,
      useExisting: ServerSocketAgent,
      multi: true
    },
    {
      provide: OCAP_DATASOURCE_TOKEN,
      useValue: {
        type: 'SQL',
        factory: async (): Promise<Type<DataSource>> => {
          const { SQLDataSource } = await import('@metad/ocap-sql')
          return SQLDataSource
        }
      },
      multi: true
    },
    {
      provide: OCAP_DATASOURCE_TOKEN,
      useValue: {
        type: 'XMLA',
        factory: async (): Promise<Type<DataSource>> => {
          const { XmlaDataSource } = await import('@metad/ocap-xmla')
          return XmlaDataSource
        }
      },
      multi: true
    },
    {
      provide: NX_STORY_STORE,
      useClass: StoryStoreService
    },
    {
      provide: NX_STORY_MODEL,
      useClass: StoryModelService
    },
    {
      provide: NX_STORY_FEED,
      useClass: StoryFeedService
    },
    {
      provide: NgmCopilotService,
      useExisting: PACCopilotService
    },
    NgmCopilotEngineService,
    {
      provide: NgmCopilotContextToken,
      useClass: NgmCopilotContextService
    },
    provideDimensionMemberRetriever(),
    provideCheckpointSaver(),
    provideCommandFewShotPrompt(),
  ]
})
export class FeaturesModule {}
