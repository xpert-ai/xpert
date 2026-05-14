import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'ngm-slash-svg',
  templateUrl: './slash.component.svg',
  styles: [``],
  host: {
    class: 'ngm-svg ngm-slash-svg'
  }
})
export class SlashSvgComponent {
  readonly class = input<string>('')
}
