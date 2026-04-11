import { CommonModule } from '@angular/common'
import { Component, Input, NgModule } from '@angular/core'
import { FormGroup, ReactiveFormsModule } from '@angular/forms'
import { NgmFormlyModule } from '@xpert-ai/formly'

import { FormlyFormOptions, FormlyModule } from '@ngx-formly/core'
import { PACFormlyArrayModule } from '../array'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'pac-formly-form-pannel',
  template: `<formly-form
    [form]="formGroup"
    [fields]="fields"
    [model]="model"
    (modelChange)="onModelChange($event)"
    [options]="options"
  ></formly-form>
<button z-button zType="ghost" type="submit" (click)="onSubmit()">Submit</button>
<button z-button zType="ghost" type="button" (click)="options.resetModel()">Reset</button>
<button z-button zType="ghost" type="button" (click)="options.updateInitialValue()">Update Intial Values</button>
`,
  styles: [``],
})
export class NxFormlyFormPannelComponent {
  public formGroup = new FormGroup({})
  @Input() fields
  @Input() model = {}
  @Input() options: FormlyFormOptions = {}

  onModelChange(event) {
    console.warn(event)
  }

  onSubmit() {
    console.warn(this.model)
  }
}

@NgModule({
  declarations: [NxFormlyFormPannelComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormlyModule,
    NgmFormlyModule,
    ZardButtonComponent,
    PACFormlyArrayModule
  ],
  exports: [NxFormlyFormPannelComponent]
})
export class NxFormlyFormModule { }
