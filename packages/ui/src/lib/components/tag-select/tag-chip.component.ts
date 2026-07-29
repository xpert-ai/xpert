import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import { ZardChipRemoveDirective, ZardChipRowComponent } from '../chips'
import { ZardIconComponent } from '../icon'

@Component({
  selector: 'z-tag-select-chip',
  imports: [ZardChipRowComponent, ZardChipRemoveDirective, ZardIconComponent],
  templateUrl: './tag-chip.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'zTagSelectChip'
})
export class ZardTagSelectChipComponent {
  readonly label = input<string>('')
  readonly disabled = input(false)
  readonly removable = input(true)

  readonly removed = output<void>()
}
