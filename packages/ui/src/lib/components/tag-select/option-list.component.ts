import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChildren } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { commandEmptyVariants, commandItemVariants, commandListVariants } from '../command/command.variants'
import { ZardCheckboxComponent } from '../checkbox'
import { mergeClasses } from '../../utils/merge-classes'

import type { ZardTagSelectOption } from './tag-select.types'

@Component({
  selector: 'z-tag-select-option-list',
  imports: [FormsModule, ZardCheckboxComponent],
  templateUrl: './option-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  exportAs: 'zTagSelectOptionList'
})
export class ZardTagSelectOptionListComponent {
  private readonly optionElements = viewChildren<ElementRef<HTMLElement>>('optionElement')

  readonly options = input<readonly ZardTagSelectOption<unknown>[]>([])
  readonly activeIndex = input(-1)
  readonly emptyText = input('No results found.')
  readonly checkable = input(false)
  readonly selectedValues = input<readonly unknown[]>([])

  readonly optionSelected = output<ZardTagSelectOption<unknown>>()
  readonly activeIndexChange = output<number>()

  protected readonly listClasses = mergeClasses(commandListVariants(), 'max-h-64')
  protected readonly emptyClasses = mergeClasses(commandEmptyVariants())

  constructor() {
    effect(() => {
      const activeIndex = this.activeIndex()
      if (activeIndex < 0) {
        return
      }

      const element = this.optionElements()[activeIndex]?.nativeElement
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  protected optionClasses(index: number, disabled: boolean): string {
    return mergeClasses(
      commandItemVariants(),
      disabled ? 'pointer-events-none opacity-50' : '',
      this.activeIndex() === index ? 'bg-accent text-accent-foreground' : ''
    )
  }

  protected onMouseDown(event: MouseEvent): void {
    event.preventDefault()
  }

  protected onMouseEnter(index: number): void {
    this.activeIndexChange.emit(index)
  }

  protected onOptionClick(option: ZardTagSelectOption<unknown>): void {
    if (option.disabled) {
      return
    }

    this.optionSelected.emit(option)
  }

  protected isSelected(option: ZardTagSelectOption<unknown>): boolean {
    return this.selectedValues().some((value) => Object.is(value, option.value))
  }
}
