import { type Type } from '@angular/core';

import { toast, type ExternalToast } from 'ngx-sonner';
import { Subject } from 'rxjs';

type ToastContent = string | Type<unknown>;

export class ZardToastRef {
  private readonly action$ = new Subject<void>();

  constructor(public id: number | string) {}

  dismiss() {
    toast.dismiss(this.id);
    this.complete();
  }

  onAction() {
    return this.action$.asObservable();
  }

  success(message: ToastContent, options?: ExternalToast) {
    toast.success(message, { ...options, id: this.id });
    return this;
  }

  error(message: ToastContent, options?: ExternalToast) {
    toast.error(message, { ...options, id: this.id });
    return this;
  }

  info(message: ToastContent, options?: ExternalToast) {
    toast.info(message, { ...options, id: this.id });
    return this;
  }

  warning(message: ToastContent, options?: ExternalToast) {
    toast.warning(message, { ...options, id: this.id });
    return this;
  }

  loading(message: ToastContent, options?: ExternalToast) {
    toast.loading(message, { ...options, id: this.id });
    return this;
  }

  message(message: ToastContent, options?: ExternalToast) {
    toast.message(message, { ...options, id: this.id });
    return this;
  }

  handleAction() {
    this.action$.next();
    this.complete();
  }

  private complete() {
    if (!this.action$.closed) {
      this.action$.complete();
    }
  }
}
