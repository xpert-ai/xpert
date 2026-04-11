import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { FormlyTabGroupComponent } from './tab-group.component'
import { ZardIconComponent, ZardTabsImports } from '@xpert-ai/headless-ui'

/**
 * @deprecated use hl-tabs
 */
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardTabsImports,
    ZardIconComponent,
    FormlyModule.forChild({
      types: [
        {
          name: 'tabs',
          component: FormlyTabGroupComponent
        }
      ]
    })
  ],
  exports: [FormlyTabGroupComponent],
  declarations: [FormlyTabGroupComponent],
  providers: []
})
export class FormlyTabGroupModule {}
