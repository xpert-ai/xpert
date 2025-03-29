import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

let slideToggleId = 0

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  selector: 'ngm-slide-toggle',
  templateUrl: 'slide-toggle.component.html',
  styleUrls: ['slide-toggle.component.scss'],
  hostDirectives: [
    {
        directive: NgmDensityDirective,
        inputs: [ 'small', 'large' ]
    },
    NgxControlValueAccessor
  ]
})
export class NgmSlideToggleComponent {

  id = slideToggleId++

  readonly cva = inject(NgxControlValueAccessor)

  readonly label = input<string>()
  readonly disabled = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly value$ = this.cva.value$

  toggle() {
    this.value$.update((state) => !state)
  }
}