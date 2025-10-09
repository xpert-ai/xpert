import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

let checkboxId = 0

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  selector: 'ngm-checkbox',
  templateUrl: 'checkbox.component.html',
  styleUrls: ['checkbox.component.scss'],
  hostDirectives: [
    {
        directive: NgmDensityDirective,
        inputs: [ 'small', 'large' ]
    },
    NgxControlValueAccessor
  ]
})
export class NgmCheckboxComponent {

  id = checkboxId++

  readonly cva = inject(NgxControlValueAccessor)

  // Inputs
  readonly label = input<string>()
  readonly indeterminate = input<boolean>(false)
  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly value$ = this.cva.value$

  toggle() {
    this.value$.update((state) => !state)
  }
}