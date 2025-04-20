import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { HLFormlyTabsComponent } from './hl-tabs.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    HLFormlyTabsComponent,

    FormlyModule.forChild({
      types: [
        {
          name: 'tabs',
          component: HLFormlyTabsComponent,
        },
      ],
    }),
  ],
  exports: [HLFormlyTabsComponent],
})
export class HLFormlyTabsModule {}
