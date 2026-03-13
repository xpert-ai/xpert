import { Injectable, inject } from '@angular/core'
import { type ExternalToast } from 'ngx-sonner'
import { TranslateService } from '@ngx-translate/core'
import { ZardAlertDialogService, ZardToastService } from '@xpert-ai/headless-ui'
import { catchError, EMPTY, Observable, Subject, take, takeUntil, tap } from 'rxjs'
import { getErrorMessage } from '../types'

type TranslationParams = Record<string, unknown> | string | null | undefined
type ToastrConfig = ExternalToast & {
  horizontalPosition?: 'start' | 'center' | 'end'
  verticalPosition?: 'top' | 'bottom'
}

@Injectable({
  providedIn: 'root'
})
export class ToastrService {
  constructor(
    private readonly toast: ZardToastService,
    private readonly alertDialog: ZardAlertDialogService,
    private readonly translateService: TranslateService
  ) {}

  success(message: any, translationParams: TranslationParams = {}, title?: string) {
    const displayMessage = this.resolveMessage(message)
    const normalizedTitle = typeof translationParams === 'string' && !title ? translationParams : title

    return this.toast.success(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(normalizedTitle || 'PAC.TOASTR.TITLE.SUCCESS'),
      duration: 2000
    })
  }

  warning(message: any, translationParams: TranslationParams = {}, title?: string, config?: ToastrConfig) {
    const displayMessage = this.resolveMessage(message)
    const normalizedTitle = typeof translationParams === 'string' && !title ? translationParams : title

    this.toast.warning(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(normalizedTitle || 'PAC.TOASTR.TITLE.WARNING', { Default: 'Warning' }),
      duration: config?.duration ?? 3000,
      position: this.toPosition(config)
    })
  }

  danger(error: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: TranslationParams = {}, config?: ToastrConfig) {
    let displayMessage = getErrorMessage(error)
    if (!displayMessage) {
      displayMessage = 'PAC.TOASTR.SystemError'
      translationParams = { ...this.toTranslationParams(translationParams), Default: 'System Error!' }
    }

    this.toast.error(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(title || 'PAC.TOASTR.TITLE.ERROR'),
      duration: config?.duration ?? 5 * 1000,
      position: this.toPosition(config)
    })
  }

  error(message: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: TranslationParams = {}) {
    this.danger(message, title, translationParams)
  }

  info(
    message: {code: string, default: string},
    action?: {code: string, default: string},
    options?: {
      duration?: number,
    }
  ) {
    return this.toast.info(this.getTranslation(message.code, { Default: message.default }), {
      action: action
        ? {
            label: this.getTranslation(action.code, { Default: action.default }),
            onClick: () => undefined
          }
        : undefined,
      duration: options?.duration ?? 3000
    })
  }

  update({code, params}: { code: string; params?: TranslationParams }, fun: () => Observable<any>) {
    const title = this.getTranslation(code, this.toTranslationParams(params))
    const message = this.getTranslation('PAC.TOASTR.Updating', { value: title, Default: `${title} Updating...` })
    const cancel$ = new Subject<void>()
    let processing = this.toast.loading(message, {
      duration: Number.POSITIVE_INFINITY,
      closeButton: true
    })

    processing = this.toast.loading(message, {
      id: processing.id,
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
      cancel: {
        label: this.getTranslation('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' }),
        onClick: () => {
          processing.dismiss()
          cancel$.next()
          cancel$.complete()
        }
      }
    })

    return fun().pipe(
      takeUntil(cancel$),
      catchError((err) => {
        processing.error(getErrorMessage(err?.error ?? err), { duration: 3000 })
        return EMPTY
      }),
      tap(() => {
        const doneMessage = this.getTranslation('PAC.TOASTR.UpdateDone', { value: title, Default: `${title} Updated!` })
        processing.success(doneMessage, { duration: 2000 })
      })
    )
  }

  confirm({code, params}: { code: string; params?: TranslationParams }, _config?: ToastrConfig) {
    const message = this.getTranslation(code, this.toTranslationParams(params))
    const confirm = this.getTranslation('PAC.KEY_WORDS.Confirm', {Default: 'Confirm'})
    const cancel = this.getTranslation('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' })

    return this.alertDialog.confirm({
      description: message,
      actionText: confirm,
      cancelText: cancel,
      destructive: false
    }).pipe(take(1))
  }

  private getTranslation(prefix: string, params?: Record<string, unknown>) {
    return this.translateService.instant(prefix, params)
  }

  private resolveMessage(message: any) {
    if (message && message.message && typeof message.message === 'string') {
      return message.message
    }

    return message
  }

  private toTranslationParams(params?: TranslationParams) {
    if (typeof params === 'string') {
      return { Default: params }
    }

    return params ?? {}
  }

  private toPosition(config?: ToastrConfig): ExternalToast['position'] | undefined {
    if (!config?.horizontalPosition && !config?.verticalPosition) {
      return undefined
    }

    const vertical = config?.verticalPosition ?? 'bottom'
    const horizontal = config?.horizontalPosition ?? 'end'

    if (horizontal === 'center') {
      return `${vertical}-center`
    }

    return `${vertical}-${horizontal === 'start' ? 'left' : 'right'}`
  }
}

export function injectToastr() {
  return inject(ToastrService)
}
