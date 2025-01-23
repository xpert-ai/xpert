import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, input } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { IXpertTask } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

@Component({
  standalone: true,
  selector: 'xpert-task-form',
  templateUrl: './task-form.component.html',
  styleUrl: `./task-form.component.scss`,
  imports: [CommonModule, ReactiveFormsModule, TextFieldModule, TranslateModule],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertTaskFormComponent {
  protected cva = inject<NgxControlValueAccessor<Partial<IXpertTask> | null>>(NgxControlValueAccessor)

  readonly task = input<IXpertTask>()

  readonly value$ = this.cva.value$

  readonly formGroup = new FormGroup({
    name: new FormControl(''),
    agentKey: new FormControl(''),
    prompt: new FormControl(''),
    schedule: new FormControl(''),
  })

  constructor() {
    effect(() => {
      if (this.task()) {
        this.formGroup.patchValue(this.task())
        this.formGroup.markAsPristine()
      }
    }, { allowSignalWrites: true })
  }
}
