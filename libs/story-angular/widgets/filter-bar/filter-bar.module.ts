import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmControlsModule, NgmMemberDatepickerModule, NgmTimeFilterModule } from '@metad/ocap-angular/controls'
import { NxSmartFilterBarComponent } from './filter-bar.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NxSmartFilterBarComponent],
  exports: [NxSmartFilterBarComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    TranslateModule,
    NgmTimeFilterModule,
    NgmMemberDatepickerModule,
    // OCAP Modules
    OcapCoreModule,
    NgmControlsModule,
  ]
})
export class PACWidgetFilterBarModule {
  static forRoot(): ModuleWithProviders<PACWidgetFilterBarModule> {
    return {
      ngModule: PACWidgetFilterBarModule,
      providers: [
        // {
        //   provide: STORY_WIDGET_COMPONENT,
        //   useValue: {
        //     type: ComponentSettingsType.StoryFilterBar,
        //     component: NxSmartFilterBarComponent,
        //     mapping: ['title', 'dataSettings', 'options', 'styling'],
        //     menu: [
        //       {
        //         icon: 'edit',
        //         action: 'edit',
        //         label: 'Edit Input Control'
        //       }
        //     ],
        //     icon: 'view_agenda',
        //     label: '过滤器栏'
        //   },
        //   multi: true
        // },
        // {
        //   provide: STORY_DESIGNER_COMPONENT,
        //   useValue: {
        //     type: ComponentSettingsType.StoryFilterBar,
        //     component: NxComponentSettingsComponent,
        //     schema: StoryFilterBarSchemaService
        //   },
        //   multi: true
        // },
        // {
        //   provide: STORY_DESIGNER_COMPONENT,
        //   useValue: {
        //     type: ComponentSettingsType.FilterBarField,
        //     component: NxComponentSettingsComponent,
        //     schema: FilterBarFieldSchemaService
        //   },
        //   multi: true
        // }
      ]
    }
  }
}
