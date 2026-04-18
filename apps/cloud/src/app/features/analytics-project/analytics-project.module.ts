import { A11yModule } from '@angular/cdk/a11y'
import { NgModule } from '@angular/core'
import { RouterModule } from '@angular/router'
import { NgmDialogComponent } from '@xpert-ai/components/dialog'
import {
  NgmCommonModule,
  NgmTableComponent,
  ResizerModule,
  TreeTableModule
} from '@xpert-ai/ocap-angular/common'
import { OcapCoreModule, provideOcapCore } from '@xpert-ai/ocap-angular/core'
import { NxStorySettingsModule, provideStorySettings } from '@xpert-ai/story'
import { TINYMCE_SCRIPT_SRC } from '@tinymce/tinymce-angular'
import { NgxEchartsModule } from 'ngx-echarts'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { STORY_WIDGET_COMPONENTS } from '../../widgets'
import { STORY_DESIGNER_COMPONENTS } from '../story/widgets'
import { AnalyticsProjectRoutingModule } from './analytics-project-routing.module'
import { provideLogger } from '../../@core'

@NgModule({
  declarations: [],
  imports: [
    A11yModule,
    RouterModule,
    AnalyticsProjectRoutingModule,
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    MonacoEditorModule.forRoot(),
    NxStorySettingsModule,
    LoggerModule,

    OcapCoreModule,
    NgmCommonModule,
    NgmDialogComponent,
    ResizerModule,
    NgmTableComponent,

    TreeTableModule
  ],
  exports: [],
  providers: [
    {
      provide: TINYMCE_SCRIPT_SRC,
      useValue: '../assets/tinymce/tinymce.min.js'
    },
    ...STORY_WIDGET_COMPONENTS,
    ...STORY_DESIGNER_COMPONENTS,
    provideStorySettings(),
    provideOcapCore(),
    provideLogger()
  ]
})
export class AnalyticsProjectModule {}
