import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-variable-svg',
  templateUrl: './variable.component.svg',
  styles: [``],
  host: {
    class: 'xp-svg xp-variable-svg'
  }
})
export class VariableSvgComponent {
  readonly class = input<string>('')
}
