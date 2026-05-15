import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'ngm-plus-svg',
  templateUrl: './plus.component.svg',
  styles: [``],
  host: {
    class: 'ngm-svg ngm-plus-svg'
  }
})
export class PlusSvgComponent {
  readonly class = input<string>('')
}
