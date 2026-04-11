import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ZardComboboxComponent, ZardComboboxOptionTemplateDirective } from './combobox.component';

@Component({
  standalone: true,
  imports: [CommonModule, ZardComboboxComponent, ZardComboboxOptionTemplateDirective],
  template: `
    <z-combobox [value]="'alpha'" [options]="options">
      <ng-template zComboboxOption let-option>
        <div class="option-shell flex min-w-0 flex-1 flex-col gap-1">
          <span class="option-label">{{ option.label }}</span>
          @if (option.data?.description) {
            <span class="option-description">{{ option.data?.description }}</span>
          }
        </div>
      </ng-template>
    </z-combobox>
  `,
})
class ComboboxProjectionHostComponent {
  readonly options = [
    {
      value: 'alpha',
      label: 'Alpha',
      command: 'Alpha first option',
      data: {
        description: 'First option description',
      },
    },
  ];
}

describe('ZardComboboxComponent', () => {
  it('renders projected option content inside command options', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [ComboboxProjectionHostComponent],
    }).createComponent(ComboboxProjectionHostComponent);
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();

    const combobox = fixture.debugElement.query(By.directive(ZardComboboxComponent))
      .componentInstance as ZardComboboxComponent;

    combobox.popoverDirective().show();
    fixture.detectChanges();
    await fixture.whenStable();

    const overlayElement = overlayContainer.getContainerElement();
    const description = overlayElement.querySelector('.option-description') as HTMLElement | null;

    expect(description?.textContent).toContain('First option description');
  });
});
