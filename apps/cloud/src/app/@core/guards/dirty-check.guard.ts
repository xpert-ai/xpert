import { Injectable, inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanDeactivateFn } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { Observable, defer, isObservable, of } from 'rxjs'
import { switchMap, take } from 'rxjs/operators'
import { IsDirty } from '@metad/core'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'

/**
 * @deprecated use dirtyCheckGuard
 */
@Injectable()
export class DirtyCheckGuard  {
  private translateService = inject(TranslateService)
  private readonly alertDialog = inject(ZardAlertDialogService)

  canDeactivate(component: IsDirty, currentRoute: ActivatedRouteSnapshot): Observable<boolean> {
    let dirty$: Observable<boolean>
    const componentDirty = component.isDirty$

    if (typeof componentDirty === 'function') {
      dirty$ = defer(() => toObservable(componentDirty()))
    } else {
      dirty$ = toObservable(component.isDirty())
    }

    return dirty$.pipe(
      switchMap((isDirty) => {
        if (!isDirty) {
          return of(true)
        }
        return toObservable(this.confirmChanges(currentRoute))
      }),
      take(1)
    )
  }

  confirmChanges(currentRoute: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    return this.alertDialog.confirm({
      description: this.getTranslation('PAC.MESSAGE.ConfirmExitDirtyData', {Default: 'Has dirty data, confirm exit?'}),
      actionText: this.getTranslation('PAC.MESSAGE.Sure', {Default: 'Sure'}),
      cancelText: this.getTranslation('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' })
    })
  }

  getTranslation(key: string, params?: any): string {
    return this.translateService.instant(key, params)
  }
}

export const dirtyCheckGuard: CanDeactivateFn<IsDirty> = (
  component: IsDirty,
  currentRoute: ActivatedRouteSnapshot
): Observable<boolean> => {
  const translateService = inject(TranslateService);
  const alertDialog = inject(ZardAlertDialogService);

  return toObservable(component.isDirty()).pipe(
    switchMap((isDirty) => {
      if (!isDirty) {
        return of(true);
      }
      return toObservable(confirmChanges(currentRoute, alertDialog, translateService));
    }),
    take(1)
  );
};

function confirmChanges(
  currentRoute: ActivatedRouteSnapshot,
  alertDialog: ZardAlertDialogService,
  translateService: TranslateService
): Observable<boolean> | boolean {
  return alertDialog.confirm({
    description: translateService.instant('PAC.MESSAGE.ConfirmExitDirtyData', { Default: 'Has dirty data, confirm exit?' }),
    actionText: translateService.instant('PAC.MESSAGE.Sure', { Default: 'Sure' }),
    cancelText: translateService.instant('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' })
  });
}

function toObservable<T>(source: T | Observable<T>): Observable<T> {
  return isObservable(source) ? source : of(source)
}
