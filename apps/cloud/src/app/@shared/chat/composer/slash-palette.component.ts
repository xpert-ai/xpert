import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardEmptyComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ChatComposerSlashOption, flattenSlashOptions, getSlashOptionKey } from './composer'

@Component({
  selector: 'xp-chat-slash-palette',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent
  ],
  templateUrl: './slash-palette.component.html',
  styleUrl: './slash-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatSlashPaletteComponent {
  readonly options = input<ChatComposerSlashOption[]>([])
  readonly activeIndex = input(0)
  readonly title = input<string | null>(null)
  readonly loading = input(false)

  readonly optionSelect = output<ChatComposerSlashOption>()
  readonly activeIndexChange = output<number>()

  readonly flatOptions = computed(() => flattenSlashOptions(this.options()))
  readonly optionKey = getSlashOptionKey

  iconFor(option: ChatComposerSlashOption) {
    if (option.type === 'capability') {
      if (option.capability?.type === 'skill') {
        return 'hammer'
      }
      if (option.capability?.type === 'plugin') {
        return 'puzzle'
      }
      return 'users'
    }

    if (option.builtin?.command === 'plan') {
      return 'list-filter-plus'
    }
    if (option.builtin?.group === 'skill') {
      return 'hammer'
    }
    if (option.builtin?.group === 'plugin') {
      return 'puzzle'
    }
    if (option.builtin?.group === 'subAgent') {
      return 'users'
    }
    return 'message-circle-more'
  }

  choose(option: ChatComposerSlashOption) {
    if (this.isDisabled(option)) {
      return
    }
    this.optionSelect.emit(option)
  }

  isDisabled(option: ChatComposerSlashOption) {
    return !!(option.disabled || option.disabledReason || option.disabledReasonKey)
  }

  flatIndexFor(option: ChatComposerSlashOption) {
    return this.flatOptions().findIndex((item) => this.optionKey(item) === this.optionKey(option))
  }
}
