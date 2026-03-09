import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EMPTY, Observable, of, switchMap } from 'rxjs';

import { ZardDialogOptions } from '../../components/dialog/dialog.component';
import { Z_MODAL_DATA, ZardDialogService } from '../../components/dialog/dialog.service';
import { injectUiI18nService } from '../../core';

export type TConfirmInfo = {
  title?: string;
  information: string;
};

@Component({
  standalone: true,
  selector: 'xp-confirm-dialog-content',
  template: `
    <div class="min-h-[100px] py-1 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
      {{ data?.information ?? '' }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiConfirmDialogContentComponent {
  readonly data = inject<TConfirmInfo>(Z_MODAL_DATA);
}

export function injectConfirm() {
  const dialog = inject(ZardDialogService);
  const i18n = injectUiI18nService();

  return <T>(info: TConfirmInfo, execution?: Observable<T>) => {
    const options = new ZardDialogOptions<UiConfirmDialogContentComponent, TConfirmInfo>();
    options.zTitle = info.title ?? i18n.t('xp-ui:confirm.delete', { Default: 'Confirm Delete' });
    options.zContent = UiConfirmDialogContentComponent;
    options.zData = info;
    options.zWidth = '32rem';
    options.zOkText = i18n.t('xp-ui:confirm.confirm', { Default: 'Confirm' });
    options.zCancelText = i18n.t('xp-ui:confirm.cancel', { Default: 'Cancel' });
    options.zOnOk = () => ({ confirmed: true });
    options.zOnCancel = () => undefined;
    options.zCustomClasses = 'xp-ui-shell border-border/80';

    const dialogRef = dialog.create(options);
    const originalClose = dialogRef.close.bind(dialogRef);

    const decision$ = new Observable<boolean>((subscriber) => {
      let completed = false;
      const complete = (confirmed: boolean) => {
        if (completed) {
          return;
        }
        completed = true;
        subscriber.next(confirmed);
        subscriber.complete();
      };

      dialogRef.close = (result?: boolean) => {
        complete(Boolean(result));
        originalClose(result);
      };

      return () => {
        if (!completed) {
          complete(false);
        }
        dialogRef.close = originalClose;
      };
    });

    return decision$.pipe(
      switchMap((confirm) => (confirm ? (execution ?? of(confirm as T)) : EMPTY)),
    );
  };
}
