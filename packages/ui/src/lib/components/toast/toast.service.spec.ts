import { TestBed } from '@angular/core/testing';

import { toast } from 'ngx-sonner';

import { ZardToastService } from './toast.service';

describe('ZardToastService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates success to ngx-sonner and returns a ref', () => {
    TestBed.configureTestingModule({});
    const successSpy = jest.spyOn(toast, 'success').mockReturnValue('toast-success');

    const service = TestBed.inject(ZardToastService);
    const ref = service.success('Saved', { duration: 2000 });

    expect(successSpy).toHaveBeenCalledWith('Saved', { duration: 2000 });
    expect(ref.id).toBe('toast-success');
  });

  it('updates an existing loading toast through the ref', () => {
    const successSpy = jest.spyOn(toast, 'success').mockReturnValue('toast-loading');
    const dismissSpy = jest.spyOn(toast, 'dismiss').mockImplementation(() => undefined);

    const service = TestBed.inject(ZardToastService);
    const ref = service.loading('Uploading');

    ref.success('Uploaded');
    ref.dismiss();

    expect(successSpy).toHaveBeenCalledWith('Uploaded', { id: ref.id });
    expect(dismissSpy).toHaveBeenCalledWith(ref.id);
  });

  it('delegates promise flows to ngx-sonner', () => {
    const promiseSpy = jest.spyOn(toast, 'promise').mockReturnValue('toast-promise');

    const service = TestBed.inject(ZardToastService);
    const promise = Promise.resolve('done');
    const ref = service.promise(promise, {
      loading: 'Saving',
      success: 'Saved',
      error: 'Failed',
    });

    expect(promiseSpy).toHaveBeenCalledWith(promise, {
      loading: 'Saving',
      success: 'Saved',
      error: 'Failed',
    });
    expect(ref?.id).toBe('toast-promise');
  });
});
