import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild
} from '@angular/core'

import { ZardIconComponent } from '../icon'
import { XP_DIALOG_CONTEXT } from '../dialog/dialog-context'
import { mergeClasses } from '../../utils/merge-classes'

import { ZardTagSelectChipComponent } from './tag-chip.component'

export interface ZardTagSelectDisplayItem {
  key: string
  label: string
}

@Component({
  selector: 'z-tag-select-input-trigger',
  imports: [ZardTagSelectChipComponent, ZardIconComponent],
  templateUrl: './input-trigger.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block'
  },
  exportAs: 'zTagSelectInputTrigger'
})
export class ZardTagSelectInputTriggerComponent {
  private readonly dialog = inject(XP_DIALOG_CONTEXT, { optional: true })
  readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('inputElement')

  readonly items = input<readonly ZardTagSelectDisplayItem[]>([])
  readonly disabled = input(false)
  readonly inputValue = input('')
  readonly placeholder = input('')
  readonly canInput = input(true)
  readonly clearable = input(false)
  readonly showClear = input(false)
  readonly showSuggestionsIndicator = input(false)
  readonly suggestionsOpen = input(false)

  protected readonly classes = computed(() =>
    mergeClasses(
      'flex min-h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground transition-[border-color,box-shadow] outline-none',
      'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 pointer-coarse:min-h-[44px]',
      this.dialog ? 'min-h-[36px]' : ''
    )
  )

  readonly chipRemove = output<number>()
  readonly inputValueChange = output<string>()
  readonly inputKeydown = output<KeyboardEvent>()
  readonly inputPaste = output<ClipboardEvent>()
  readonly inputFocus = output<void>()
  readonly inputBlur = output<void>()
  readonly clear = output<void>()

  focusInput(): void {
    this.inputElement()?.nativeElement.focus()
  }

  protected onContainerMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!this.canInput() || this.disabled() || target?.closest('button')) {
      return
    }

    event.preventDefault()
    this.focusInput()
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null
    this.inputValueChange.emit(target?.value ?? '')
  }

  protected onClear(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.clear.emit()
  }
}
