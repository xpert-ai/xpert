import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { BasicInfoFormComponent } from './basic-info/basic-info-form.component'
export const COMPONENTS = [BasicInfoFormComponent]

@NgModule({
  imports: [FormsModule, ReactiveFormsModule, FormlyModule],
  exports: [...COMPONENTS],
  declarations: [...COMPONENTS],
  providers: []
})
export class UserFormsModule {}
