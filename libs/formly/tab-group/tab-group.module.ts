import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { FormlyModule } from '@ngx-formly/core'
import { FormlyTabGroupComponent } from './tab-group.component'
import { ZardTabsImports } from '@xpert-ai/headless-ui'

/**
 * @deprecated use hl-tabs
 */
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardTabsImports,
    MatIconModule,
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
export class FormlyMatTabGroupModule {}
