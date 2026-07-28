import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, Input, computed, input } from '@angular/core'
import { DisplayBehaviour, ISelectOption, splitByHighlight } from '../../core'
import { ZardIconComponent } from '../../../../components'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-display-behaviour',
  templateUrl: './display-behaviour.component.html',
  styleUrls: ['./display-behaviour.component.scss'],
  imports: [CommonModule, ZardIconComponent]
})
export class XpDisplayBehaviourComponent {
  DISPLAY_BEHAVIOUR = DisplayBehaviour

  @Input() displayBehaviour: DisplayBehaviour | string
  @HostBinding('class.xp-display-behaviour__exclude-selected')
  @Input()
  excludeSelected: boolean

  readonly option = input<ISelectOption<any>>({})
  readonly highlight = input<string | string[]>()

  @HostBinding('class.xp-display-behaviour') isDisplayBehaviour = true

  @HostBinding('class.xp-display-behaviour__descriptionAndId')
  get isDescriptionAndId() {
    return this.displayBehaviour === DisplayBehaviour.descriptionAndId
  }

  @HostBinding('class.xp-display-behaviour__idAndDescription')
  get isIdAndDescription() {
    return this.displayBehaviour === DisplayBehaviour.idAndDescription
  }

  @HostBinding('class.xp-display-behaviour__descriptionOnly')
  get isDescriptionOnly() {
    return this.displayBehaviour === DisplayBehaviour.descriptionOnly
  }

  @HostBinding('class.xp-display-behaviour__auto')
  get isAuto() {
    return this.displayBehaviour === DisplayBehaviour.auto || !this.displayBehaviour
  }

  @HostBinding('class.xp-display-behaviour__no-label')
  get noLabel() {
    return !(this.option()?.caption || this.option()?.label)
  }

  readonly value = computed(() => {
    const highlight = this.highlight()
    const option = this.option()
    return splitByHighlight(option.key ?? option.value, highlight)
  })

  readonly text = computed(() => {
    const highlight = this.highlight()
    const option = this.option()
    return splitByHighlight(option.caption || option.label, highlight)
  })
}
