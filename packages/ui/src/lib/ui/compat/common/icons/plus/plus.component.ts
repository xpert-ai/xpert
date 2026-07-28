import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-plus-svg',
  templateUrl: './plus.component.svg',
  styles: [``],
  host: {
    class: 'xp-svg xp-plus-svg'
  }
})
export class PlusSvgComponent {
  readonly class = input<string>('')
}
