import { Injectable } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'
import { TranslateService } from '@ngx-translate/core'

@Injectable({ providedIn: 'root' })
export class ToastrService {
  constructor(private readonly _snackBar: MatSnackBar, private readonly translateService: TranslateService) {}

  success(message: any, translationParams: Object = {}, title?: string) {
    let displayMessage = ''

    if (message && message.message && typeof message.message === 'string') {
      displayMessage = message.message
    } else {
      displayMessage = message
    }

    this._snackBar.open(
      this.getTranslation(displayMessage, translationParams),
      this.getTranslation(title || 'PAC.TOASTR.TITLE.SUCCESS'),
      { duration: 2000 }
    )
  }

  warning(message: any, translationParams: Object = {}, title?: string) {
    let displayMessage = ''

    if (message && message.message && typeof message.message === 'string') {
      displayMessage = message.message
    } else {
      displayMessage = message
    }

    this._snackBar.open(
      this.getTranslation(displayMessage, translationParams),
      this.getTranslation(title || 'PAC.TOASTR.TITLE.WARNING', {Default: 'Warning'}),
      { duration: 3000 }
    )
  }

  danger(error: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: Object = {}) {
    let displayMessage = ''

    if (error.error && error.error.message && typeof error.error.message === 'string') {
      displayMessage = error.error.message
    } else if (error.message && typeof error.message === 'string') {
      displayMessage = error.message
    } else {
      displayMessage = error
    }

    this._snackBar.open(
      this.getTranslation(displayMessage, translationParams),
      this.getTranslation(title || 'PAC.TOASTR.TITLE.ERROR'),
      { duration: 5000 }
    )

  }

  error(message: any, title: string = 'PAC.TOASTR.TITLE.ERROR', translationParams: Object = {}) {
    this.danger(message, title, translationParams)
  }

  info(
    message: any,
    title: string,
    options: Object = {
      duration: 5000,
      preventDuplicates: true
    }
  ) {
    // this.nbToastrService.info(
    // 	message,
    // 	this.getTranslation(title || 'TOASTR.TITLE.INFO'),
    // 	options
    // );
  }

  private getTranslation(prefix: string, params?: Object) {
    return this.translateService.instant(prefix, params)
  }
}
