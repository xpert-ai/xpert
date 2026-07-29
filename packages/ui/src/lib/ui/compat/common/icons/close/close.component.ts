import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-close-svg',
  templateUrl: './close.component.svg',
  styles: [``],
  host: {
    class: 'xp-svg xp-close-svg'
  }
})
export class CloseSvgComponent {
  readonly class = input<string>('')
}
