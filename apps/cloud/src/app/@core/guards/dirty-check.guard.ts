import { Injectable, inject } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'
import { ActivatedRouteSnapshot, CanDeactivateFn } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { Observable, defer, isObservable, merge, of } from 'rxjs'
import { map, switchMap, take } from 'rxjs/operators'
import { IsDirty } from '@metad/core'
import { NgmConfirmSnackBar } from '@metad/ocap-angular/common'

/**
 * @deprecated use dirtyCheckGuard
 */
@Injectable()
export class DirtyCheckGuard  {
  private translateService = inject(TranslateService)
  private _snackBar = inject(MatSnackBar)

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
    const confirm = this._snackBar.openFromComponent(NgmConfirmSnackBar, {
      verticalPosition: 'top',
      horizontalPosition: 'center',
      duration: 3* 1000,
      data: {
        message: this.getTranslation('PAC.MESSAGE.ConfirmExitDirtyData', {Default: 'Has dirty data, confirm exit?'}),
        action: this.getTranslation('PAC.MESSAGE.Sure', {Default: 'Sure'})
      }
    })

    return merge(confirm.afterDismissed().pipe(map(() => false)), confirm.onAction().pipe(map(() => true))).pipe(
      take(1)
    )
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
  const snackBar = inject(MatSnackBar);

  return toObservable(component.isDirty()).pipe(
    switchMap((isDirty) => {
      if (!isDirty) {
        return of(true);
      }
      return toObservable(confirmChanges(currentRoute, snackBar, translateService));
    }),
    take(1)
  );
};

function confirmChanges(
  currentRoute: ActivatedRouteSnapshot,
  snackBar: MatSnackBar,
  translateService: TranslateService
): Observable<boolean> | boolean {
  const confirm = snackBar.openFromComponent(NgmConfirmSnackBar, {
    verticalPosition: 'top',
    horizontalPosition: 'center',
    duration: 3 * 1000,
    data: {
      message: translateService.instant('PAC.MESSAGE.ConfirmExitDirtyData', { Default: 'Has dirty data, confirm exit?' }),
      action: translateService.instant('PAC.MESSAGE.Sure', { Default: 'Sure' })
    }
  });

  return merge(
    confirm.afterDismissed().pipe(map(() => false)),
    confirm.onAction().pipe(map(() => true))
  ).pipe(take(1));
}


function toObservable<T>(source: T | Observable<T>): Observable<T> {
  return isObservable(source) ? source : of(source)
}
