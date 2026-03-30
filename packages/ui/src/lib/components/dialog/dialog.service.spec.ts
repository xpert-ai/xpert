import { OverlayModule } from '@angular/cdk/overlay';
import { Component, TemplateRef, ViewChild, inject } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { UiDialogCloseDirective } from './dialog-close.directive';
import { ZardDialogRef } from './dialog-ref';
import { Z_MODAL_DATA } from './dialog.service';
import { ZardDialogService } from './dialog.service';

@Component({
  standalone: true,
  template: `
    <button type="button" data-testid="component-close" (click)="close()"></button>
  `,
})
class TestDialogComponent {
  private readonly dialogRef = inject(ZardDialogRef<TestDialogComponent, string>);
  private readonly data = inject<{ result?: string }>(Z_MODAL_DATA, { optional: true });

  close() {
    this.dialogRef.close(this.data?.result ?? 'component-result');
  }
}

@Component({
  standalone: true,
  template: `
    <ng-template #dialog let-dialogRef="dialogRef">
      <button type="button" data-testid="template-close" (click)="dialogRef.close('template-result')"></button>
    </ng-template>
  `,
})
class TestTemplateHostComponent {
  @ViewChild('dialog', { static: true })
  dialogTemplate!: TemplateRef<{ dialogRef: ZardDialogRef<unknown, string> }>;
}

@Component({
  standalone: true,
  imports: [UiDialogCloseDirective],
  template: `
    <ng-template #dialog>
      <button type="button" data-testid="template-directive-close" [xpDialogClose]="'directive-result'"></button>
    </ng-template>
  `,
})
class TestTemplateDirectiveHostComponent {
  @ViewChild('dialog', { static: true })
  dialogTemplate!: TemplateRef<unknown>;
}

describe('ZardDialogService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove());
  });

  it('applies zBackdropClass to the overlay backdrop', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule, TestDialogComponent],
    });

    const service = TestBed.inject(ZardDialogService);
    const ref = service.open(TestDialogComponent, {
      backdropClass: ['custom-backdrop', 'backdrop-blur-sm-black'],
    });

    tick();

    expect(document.querySelector('.cdk-overlay-backdrop.custom-backdrop.backdrop-blur-sm-black')).not.toBeNull();

    ref.close();
    tick(150);
  }));

  it('keeps the dialog open when zMaskClosable is disabled', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule, TestDialogComponent],
    });

    const service = TestBed.inject(ZardDialogService);
    let result: string | undefined;

    const ref = service.open(TestDialogComponent, {
      disableClose: true,
    });

    ref.afterClosed().subscribe((value) => {
      result = value;
    });

    tick();
    (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    tick(200);

    expect(document.querySelector('z-dialog')).not.toBeNull();
    expect(result).toBeUndefined();

    ref.close('manual-close');
    tick(150);
    expect(result).toBe('manual-close');
  }));

  it('emits the component dialog close result', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule, TestDialogComponent],
    });

    const service = TestBed.inject(ZardDialogService);
    let result: string | undefined;

    service
      .open(TestDialogComponent, {
        data: { result: 'component-result' },
      })
      .afterClosed()
      .subscribe((value) => {
        result = value;
      });

    tick();
    (document.querySelector('[data-testid="component-close"]') as HTMLButtonElement).click();
    tick(150);

    expect(result).toBe('component-result');
  }));

  it('emits the template dialog close result', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule, TestTemplateHostComponent],
    });

    const fixture = TestBed.createComponent(TestTemplateHostComponent);
    fixture.detectChanges();

    const service = TestBed.inject(ZardDialogService);
    let result: string | undefined;

    service.open(fixture.componentInstance.dialogTemplate).afterClosed().subscribe((value) => {
      result = value;
    });

    tick();
    (document.querySelector('[data-testid="template-close"]') as HTMLButtonElement).click();
    tick(150);

    expect(result).toBe('template-result');
  }));

  it('lets template content close through xpDialogClose', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule, TestTemplateDirectiveHostComponent],
    });

    const fixture = TestBed.createComponent(TestTemplateDirectiveHostComponent);
    fixture.detectChanges();

    const service = TestBed.inject(ZardDialogService);
    let result: string | undefined;

    service.open(fixture.componentInstance.dialogTemplate).afterClosed().subscribe((value) => {
      result = value;
    });

    tick();
    (document.querySelector('[data-testid="template-directive-close"]') as HTMLButtonElement).click();
    tick(150);

    expect(result).toBe('directive-result');
  }));
});
