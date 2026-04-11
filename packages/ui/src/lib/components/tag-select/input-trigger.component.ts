import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

import { ZardIconComponent } from '@/src/lib/components/icon';
import { ZardInputDirective } from '@/src/lib/components/input';

import { ZardTagSelectChipComponent } from './tag-chip.component';

export interface ZardTagSelectDisplayItem {
  key: string;
  label: string;
}

@Component({
  selector: 'z-tag-select-input-trigger',
  imports: [ZardTagSelectChipComponent, ZardInputDirective, ZardIconComponent],
  templateUrl: './input-trigger.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  exportAs: 'zTagSelectInputTrigger',
})
export class ZardTagSelectInputTriggerComponent {
  readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('inputElement');

  readonly items = input<readonly ZardTagSelectDisplayItem[]>([]);
  readonly disabled = input(false);
  readonly inputValue = input('');
  readonly placeholder = input('');
  readonly canInput = input(true);
  readonly clearable = input(false);
  readonly showClear = input(false);
  readonly showSuggestionsIndicator = input(false);
  readonly suggestionsOpen = input(false);

  readonly chipRemove = output<number>();
  readonly inputValueChange = output<string>();
  readonly inputKeydown = output<KeyboardEvent>();
  readonly inputPaste = output<ClipboardEvent>();
  readonly inputFocus = output<void>();
  readonly inputBlur = output<void>();
  readonly clear = output<void>();

  focusInput(): void {
    this.inputElement()?.nativeElement.focus();
  }

  protected onContainerMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!this.canInput() || this.disabled() || target?.closest('button')) {
      return;
    }

    event.preventDefault();
    this.focusInput();
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.inputValueChange.emit(target?.value ?? '');
  }

  protected onClear(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.clear.emit();
  }
}
