import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, Input, computed, input } from '@angular/core'
import { ISelectOption, splitByHighlight } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-display-behaviour',
  templateUrl: './display-behaviour.component.html',
  styleUrls: ['./display-behaviour.component.scss'],
  imports: [CommonModule, ZardIconComponent]
})
export class NgmDisplayBehaviourComponent {
  DISPLAY_BEHAVIOUR = DisplayBehaviour

  @Input() displayBehaviour: DisplayBehaviour | string
  @HostBinding('class.ngm-display-behaviour__exclude-selected')
  @Input()
  excludeSelected: boolean

  readonly option = input<ISelectOption<any>>({})
  readonly highlight = input<string | string[]>()

  @HostBinding('class.ngm-display-behaviour') isDisplayBehaviour = true

  @HostBinding('class.ngm-display-behaviour__descriptionAndId')
  get isDescriptionAndId() {
    return this.displayBehaviour === DisplayBehaviour.descriptionAndId
  }

  @HostBinding('class.ngm-display-behaviour__idAndDescription')
  get isIdAndDescription() {
    return this.displayBehaviour === DisplayBehaviour.idAndDescription
  }

  @HostBinding('class.ngm-display-behaviour__descriptionOnly')
  get isDescriptionOnly() {
    return this.displayBehaviour === DisplayBehaviour.descriptionOnly
  }

  @HostBinding('class.ngm-display-behaviour__auto')
  get isAuto() {
    return this.displayBehaviour === DisplayBehaviour.auto || !this.displayBehaviour
  }

  @HostBinding('class.ngm-display-behaviour__no-label')
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
