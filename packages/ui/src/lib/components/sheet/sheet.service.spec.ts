import { Component, inject } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { ZardSheetRef } from './sheet-ref';
import { ZardSheetService } from './sheet.service';
import { Z_SHEET_DATA } from './sheet.service';

@Component({
  template: `{{ data.label }}`,
})
class TestSheetContentComponent {
  readonly data = inject<{ label: string }>(Z_SHEET_DATA);
  readonly sheetRef = inject(ZardSheetRef<TestSheetContentComponent, string>);
}

describe('ZardSheetService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove());
  });

  it('opens component content and injects Z_SHEET_DATA', () => {
    TestBed.configureTestingModule({ imports: [TestSheetContentComponent] });

    const service = TestBed.inject(ZardSheetService);
    const ref = service.open(TestSheetContentComponent, {
      zData: { label: 'Injected value' },
      zHideFooter: true,
      zClosable: false,
      zSide: 'bottom',
    });

    expect(ref.componentInstance).toBeTruthy();
    expect(ref.componentInstance?.data).toEqual({ label: 'Injected value' });
    expect(document.querySelector('.cdk-overlay-pane')).not.toBeNull();
  });

  it('emits the close result through afterClosed', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [TestSheetContentComponent] });

    const service = TestBed.inject(ZardSheetService);
    const ref = service.open(TestSheetContentComponent, {
      zData: { label: 'Closable' },
      zHideFooter: true,
      zClosable: false,
    });

    let result: string | undefined;
    ref.afterClosed().subscribe((value) => {
      result = value;
    });

    ref.close('done');
    tick(300);

    expect(result).toBe('done');
    expect(document.querySelector('z-sheet')).toBeNull();
  }));

  it('closes on Escape when mask closing is enabled', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [TestSheetContentComponent] });

    const service = TestBed.inject(ZardSheetService);
    const ref = service.open(TestSheetContentComponent, {
      zData: { label: 'Escape' },
      zHideFooter: true,
    });

    let closed = false;
    ref.afterClosed().subscribe(() => {
      closed = true;
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick(300);

    expect(closed).toBe(true);
  }));

  it('keeps the sheet open when backdrop closing is disabled', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [TestSheetContentComponent] });

    const service = TestBed.inject(ZardSheetService);
    service.open(TestSheetContentComponent, {
      zData: { label: 'Locked' },
      zHideFooter: true,
      zMaskClosable: false,
    });

    const backdrop = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
    backdrop.click();
    tick(300);

    expect(document.querySelector('z-sheet')).not.toBeNull();
  }));
});
