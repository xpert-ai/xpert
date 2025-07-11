import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core'

@Component({
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-progress-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  host: {
    class: 'ngm-progress-spinner'
  }
})
export class NgmProgressSpinnerComponent {
  readonly value = input<number, string | number>(0, {
    transform: numberAttribute
  })

  readonly progress = computed(() => 100 - this.value())
}
