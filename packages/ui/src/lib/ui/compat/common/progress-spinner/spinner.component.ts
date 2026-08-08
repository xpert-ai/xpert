import { ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core'

@Component({
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-progress-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  host: {
    class: 'xp-progress-spinner'
  }
})
export class XpProgressSpinnerComponent {
  readonly value = input<number, string | number>(0, {
    transform: numberAttribute
  })

  readonly progress = computed(() => 100 - this.value())
}
