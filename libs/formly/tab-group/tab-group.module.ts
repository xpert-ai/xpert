import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { MatTabsModule } from '@angular/material/tabs'
import { FormlyModule } from '@ngx-formly/core'
import { FormlyTabGroupComponent } from './tab-group.component'

/**
 * @deprecated use hl-tabs
 */
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTabsModule,
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
