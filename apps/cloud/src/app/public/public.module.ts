import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'
import { MatButtonModule } from '@angular/material/button'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatIconModule } from '@angular/material/icon'
import { C_URI_API_MODELS } from '@metad/cloud/state'
import { NgmTransformScaleDirective } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN, OcapCoreModule, provideOcapCore } from '@metad/ocap-angular/core'
import { NGM_WASM_AGENT_WORKER, WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { DataSource, Type } from '@metad/ocap-core'
import { NX_STORY_FEED, NX_STORY_STORE } from '@metad/story/core'
import { NxStoryModule } from '@metad/story/story'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { NgxEchartsModule } from 'ngx-echarts'
import { PAC_SERVER_AGENT_DEFAULT_OPTIONS, ServerAgent, StoryPublicResolver } from '../@core'
import { StoryFeedService, StoryPublicService } from '../services'
import { STORY_WIDGET_COMPONENTS } from '../widgets'
import { CreatedByUserPipe } from './created-by.pipe'
import { PublicPointComponent } from './point/point.component'
import { PublicRoutingModule } from './public-routing.module'
import { PublicComponent } from './public.component'
import { StoryViewerComponent } from './story/story.component'
import { PublicWidgetComponent } from './widget/widget.component'

@NgModule({
  imports: [
    CommonModule,
    PublicRoutingModule,
    MatIconModule,
    MatButtonModule,
    MatBottomSheetModule,
    MatDatepickerModule,
    ContentLoaderModule,
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    NxStoryModule,
    AnalyticalCardModule,
    OcapCoreModule,

    NgmTransformScaleDirective

    // Story Widgets
  ],
  exports: [],
  declarations: [PublicComponent, StoryViewerComponent, PublicPointComponent, PublicWidgetComponent, CreatedByUserPipe],
  providers: [
    // provideOcapCore(),
    StoryPublicResolver,
    {
      provide: NX_STORY_STORE,
      useClass: StoryPublicService
    },
    {
      provide: NX_STORY_FEED,
      useClass: StoryFeedService
    },
    WasmAgentService,
    {
      provide: NGM_WASM_AGENT_WORKER,
      useValue: '/assets/ocap-agent-data-init.worker.js'
    },
    {
      provide: PAC_SERVER_AGENT_DEFAULT_OPTIONS,
      useValue: {
        modelBaseUrl: C_URI_API_MODELS + '/public'
      }
    },
    ServerAgent,
    {
      provide: OCAP_AGENT_TOKEN,
      useExisting: WasmAgentService,
      multi: true
    },
    {
      provide: OCAP_AGENT_TOKEN,
      useExisting: ServerAgent,
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
    ...STORY_WIDGET_COMPONENTS
  ]
})
export class PublicModule {}
