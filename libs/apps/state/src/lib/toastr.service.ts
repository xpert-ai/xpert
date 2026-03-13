import { Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ZardToastService } from '@xpert-ai/headless-ui'

type TranslationParams = Record<string, unknown> | string | null | undefined

@Injectable({ providedIn: 'root' })
export class ToastrService {
  constructor(private readonly toast: ZardToastService, private readonly translateService: TranslateService) {}

  success(message: any, translationParams: TranslationParams = {}, title?: string) {
    const displayMessage = this.resolveMessage(message)
    const normalizedTitle = typeof translationParams === 'string' && !title ? translationParams : title

    this.toast.success(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(normalizedTitle || 'PAC.TOASTR.TITLE.SUCCESS'),
      duration: 2000
    })
  }

  warning(message: any, translationParams: TranslationParams = {}, title?: string) {
    const displayMessage = this.resolveMessage(message)
    const normalizedTitle = typeof translationParams === 'string' && !title ? translationParams : title

    this.toast.warning(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(normalizedTitle || 'PAC.TOASTR.TITLE.WARNING', { Default: 'Warning' }),
      duration: 3000
    })
  }

  danger(error: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: TranslationParams = {}) {
    const displayMessage = this.resolveMessage(error)

    this.toast.error(this.getTranslation(displayMessage, this.toTranslationParams(translationParams)), {
      description: this.getTranslation(title || 'PAC.TOASTR.TITLE.ERROR'),
      duration: 5000
    })
  }

  error(message: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: TranslationParams = {}) {
    this.danger(message, title, translationParams)
  }

  info(
    message: any,
    title: string,
    options: {
      duration?: number
      preventDuplicates?: boolean
    } = {
      duration: 5000,
      preventDuplicates: true
    }
  ) {
    this.toast.info(this.getTranslation(message), {
      description: this.getTranslation(title || 'TOASTR.TITLE.INFO'),
      duration: options.duration ?? 5000
    })
  }

  private getTranslation(prefix: string, params?: Record<string, unknown>) {
    return this.translateService.instant(prefix, params)
  }

  private resolveMessage(message: any) {
    if (message?.error?.message && typeof message.error.message === 'string') {
      return message.error.message
    }

    if (message?.message && typeof message.message === 'string') {
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
}
