import { Injectable } from '@angular/core';

import { map, take } from 'rxjs';

import { ZardDialogRef } from '../dialog/dialog-ref';
import { ZardDialogService } from '../dialog/dialog.service';
import { ZardAlertDialogComponent, type ZardAlertDialogOptions } from './alert-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class ZardAlertDialogService {
  constructor(private readonly dialog: ZardDialogService) {}

  open(options: ZardAlertDialogOptions) {
    return this.dialog.create<ZardAlertDialogComponent, ZardAlertDialogOptions>({
      zContent: ZardAlertDialogComponent,
      zData: options,
      zHideFooter: true,
      zClosable: options.closable ?? false,
      zMaskClosable: options.maskClosable ?? true,
      zWidth: options.width ?? 'min(32rem, calc(100vw - 2rem))',
      zCustomClasses: options.customClasses,
      zViewContainerRef: options.viewContainerRef,
    }) as ZardDialogRef<ZardAlertDialogComponent, boolean>;
  }

  confirm(options: ZardAlertDialogOptions) {
    return this.open(options).afterClosed().pipe(
      map(result => !!result),
      take(1),
    );
  }
}
