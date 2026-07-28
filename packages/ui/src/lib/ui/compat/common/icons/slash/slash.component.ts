import { Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-slash-svg',
  templateUrl: './slash.component.svg',
  styles: [``],
  host: {
    class: 'xp-svg xp-slash-svg'
  }
})
export class SlashSvgComponent {
  readonly class = input<string>('')
}
