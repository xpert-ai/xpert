import { NgModule } from '@angular/core'
import { RouterModule } from '@angular/router'
import { NgmDialogComponent } from '@xpert-ai/components/dialog'
import { NgmFormlyModule } from '@xpert-ai/formly'
import { NgmCommonModule, NgmTableComponent, TreeTableModule } from '@xpert-ai/ocap-angular/common'
import { NgmStoryModule, provideStorySettings } from '@xpert-ai/story'
import { NgmFormlyChartPropertModule } from '@xpert-ai/story/widgets/analytical-card'
import { TINYMCE_SCRIPT_SRC } from '@tinymce/tinymce-angular'
import { NgxEchartsModule } from 'ngx-echarts'
import { LoggerModule } from 'ngx-logger'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { provideLogger } from '../../@core'
import { STORY_WIDGET_COMPONENTS } from '../../widgets'
import { provideFormlyStory } from './designer'
import { StoryRoutingModule } from './story-routing.module'
import { STORY_DESIGNER_COMPONENTS } from './widgets'

@NgModule({
  declarations: [],
  imports: [
    RouterModule,
    StoryRoutingModule,
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    MonacoEditorModule.forRoot(),
    LoggerModule,

    // Formly
    NgmFormlyModule,
    NgmFormlyChartPropertModule,

    NgmCommonModule,
    NgmDialogComponent,
    NgmTableComponent,
    TreeTableModule,
    NgmStoryModule
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
    provideFormlyStory(),
    provideLogger(),
  ]
})
export class PACStoryModule {}
