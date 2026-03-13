import { Injectable, type Type } from '@angular/core';

import { toast, type ExternalToast, type PromiseData, type PromiseT } from 'ngx-sonner';

import { ZardToastRef } from './toast-ref';

type ToastContent = string | Type<unknown>;

@Injectable({
  providedIn: 'root',
})
export class ZardToastService {
  success(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.success(message, toastOptions), options);
  }

  warning(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.warning(message, toastOptions), options);
  }

  error(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.error(message, toastOptions), options);
  }

  info(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.info(message, toastOptions), options);
  }

  message(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.message(message, toastOptions), options);
  }

  loading(message: ToastContent, options?: ExternalToast) {
    return this.createRef((toastOptions) => toast.loading(message, toastOptions), options);
  }

  promise<ToastData>(promise: PromiseT<ToastData>, data?: PromiseData<ToastData>) {
    const id = toast.promise(promise, data);
    return typeof id === 'undefined' ? undefined : new ZardToastRef(id);
  }

  custom<T>(component: Type<T>, options?: ExternalToast) {
    return new ZardToastRef(toast.custom(component, options));
  }

  dismiss(id?: number | string) {
    toast.dismiss(id);
  }

  private createRef(createToast: (options?: ExternalToast) => string | number, options?: ExternalToast) {
    const ref = new ZardToastRef(-1);
    const toastOptions = this.withAction(ref, options);
    ref.id = createToast(toastOptions);

    return ref;
  }

  private withAction(ref: ZardToastRef, options?: ExternalToast): ExternalToast | undefined {
    if (!options?.action) {
      return options;
    }

    return {
      ...options,
      action: {
        ...options.action,
        onClick: (event: MouseEvent) => {
          options.action?.onClick(event);
          ref.handleAction();
        },
      },
    };
  }
}
