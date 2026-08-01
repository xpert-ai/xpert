import { CommonModule } from '@angular/common'
import { Component, Input, NgModule } from '@angular/core'
import { FormGroup, ReactiveFormsModule } from '@angular/forms'
import { XpFormlyModule } from '@xpert-ai/formly'

import { FormlyFormOptions, FormlyModule } from '@ngx-formly/core'
import { XpFormlyArrayModule } from '../array'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-formly-form-pannel',
  template: `<formly-form
      [form]="formGroup"
      [fields]="fields"
      [model]="model"
      (modelChange)="onModelChange($event)"
      [options]="options"
    ></formly-form>
    <button z-button zType="ghost" type="submit" (click)="onSubmit()">Submit</button>
    <button z-button zType="ghost" type="button" (click)="options.resetModel()">Reset</button>
    <button z-button zType="ghost" type="button" (click)="options.updateInitialValue()">Update Intial Values</button> `,
  styles: [``]
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
  imports: [CommonModule, ReactiveFormsModule, FormlyModule, XpFormlyModule, ZardButtonComponent, XpFormlyArrayModule],
  exports: [NxFormlyFormPannelComponent]
})
export class NxFormlyFormModule {}
