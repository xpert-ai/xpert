import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { PacMenuComponent } from '@xpert-ai/cloud/auth'
import { NgmFormlyModule, provideFormly, provideFormlyUi } from '@xpert-ai/formly'
import { registerEChartsThemes } from '@xpert-ai/material-theme'
import { NgmDrawerContentComponent, NgmDrawerTriggerComponent, NgmTableComponent, ResizerModule } from '@xpert-ai/ocap-angular/common'
import {
  DensityDirective,
  NgmAgentService,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN
} from '@xpert-ai/ocap-angular/core'
import { NGM_WASM_AGENT_WORKER, WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { DataSource, Type } from '@xpert-ai/ocap-core'
import { NX_STORY_FEED, NX_STORY_MODEL, NX_STORY_STORE } from '@xpert-ai/story/core'
import { environment } from '../../environments/environment'
import { DirtyCheckGuard, LocalAgent, ServerAgent, ServerSocketAgent, provideLogger } from '../@core/index'
import { AssetsComponent } from '../@shared/assets/assets.component'
import { NotificationComponent, TuneComponent } from '../@theme'
import { HeaderUserComponent, ProjectSelectorComponent, WorkspaceSelectorComponent } from '../@theme/header'
import { PACThemeModule } from '../@theme/theme.module'
import { StoryFeedService, StoryModelService, StoryStoreService } from '../services/index'
import { FeaturesRoutingModule } from './features-routing.module'
import { FeaturesComponent } from './features.component'
import { provideCheckpointSaver, provideDimensionMemberRetriever } from '../@core/copilot'
import { NgmDrawerComponent, NgmDrawerContainerComponent } from '@xpert-ai/ocap-angular/common'
import { NgxEchartsModule } from 'ngx-echarts'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { EmojiAvatarComponent } from '../@shared/avatar'
import { CdkMenuModule } from '@angular/cdk/menu'
import { LayoutComponent, SidebarComponent } from '@xpert-ai/headless-ui/components/layout'
import { ZardAvatarComponent, ZardButtonComponent, ZardDividerComponent, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

registerEChartsThemes()

@NgModule({
  declarations: [FeaturesComponent],
  imports: [
    CommonModule,
    FeaturesRoutingModule,
    CdkMenuModule,
    LayoutComponent,
    ZardIconComponent,
    SidebarComponent,
    PacMenuComponent,
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

    ZardButtonComponent,
    ZardIconComponent,
    ZardAvatarComponent,
    ZardDividerComponent,
    ...ZardMenuImports,

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
    // NgmDSCacheService,
    provideLogger(),
    provideFormly(),
    provideFormlyUi(),
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
          const { SQLDataSource } = await import('@xpert-ai/ocap-sql')
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
          const { XmlaDataSource } = await import('@xpert-ai/ocap-xmla')
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
    provideDimensionMemberRetriever(),
    provideCheckpointSaver(),
  ]
})
export class FeaturesModule {}
