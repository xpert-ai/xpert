import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { ZardAlertDialogService } from './alert-dialog.service';

describe('ZardAlertDialogService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove());
  });

  it('emits the close result through ZardDialogRef.afterClosed', fakeAsync(() => {
    TestBed.configureTestingModule({});

    const service = TestBed.inject(ZardAlertDialogService);
    const ref = service.open({
      title: 'Delete workspace',
      description: 'This action cannot be undone.',
    });

    let result: boolean | undefined;
    ref.afterClosed().subscribe((value) => {
      result = value;
    });

    ref.close(true);
    tick(150);

    expect(result).toBe(true);
    expect(document.querySelector('z-dialog')).toBeNull();
  }));

  it('returns true when the action button is clicked', fakeAsync(() => {
    TestBed.configureTestingModule({});

    const service = TestBed.inject(ZardAlertDialogService);
    let result: boolean | undefined;

    service
      .confirm({
        title: 'Delete workspace',
        description: 'This action cannot be undone.',
      })
      .subscribe((value) => {
        result = value;
      });

    tick();
    (document.querySelector('[data-testid="z-alert-dialog-action"]') as HTMLButtonElement).click();
    tick(150);

    expect(result).toBe(true);
  }));

  it('returns false when dismissed with Escape', fakeAsync(() => {
    TestBed.configureTestingModule({});

    const service = TestBed.inject(ZardAlertDialogService);
    let result: boolean | undefined;

    service
      .confirm({
        title: 'Leave this page?',
        description: 'Unsaved changes will be lost.',
      })
      .subscribe((value) => {
        result = value;
      });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick(150);

    expect(result).toBe(false);
  }));
});
