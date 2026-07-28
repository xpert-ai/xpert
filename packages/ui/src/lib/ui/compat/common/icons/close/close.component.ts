import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'ngm-close-svg',
  templateUrl: './close.component.svg',
  styles: [``],
  host: {
    class: 'ngm-svg ngm-close-svg'
  }
})
export class CloseSvgComponent {
  readonly class = input<string>('')
}
