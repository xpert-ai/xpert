import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmFactComponent } from './fact.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmFactComponent,

    FormlyModule.forChild({
      types: [
        {
          name: 'fact',
          component: NgmFactComponent,
        },
      ],
    }),
  ],
  exports: [NgmFactComponent],
})
export class NgmFormlyFactModule {}
