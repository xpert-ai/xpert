import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'ngm-variable-svg',
  templateUrl: './variable.component.svg',
  styles: [``],
  host: {
    class: 'ngm-svg ngm-variable-svg'
  }
})
export class VariableSvgComponent {
  readonly class = input<string>('')
}
