import { DialogRef } from '@angular/cdk/dialog'
import { Directive, inject, input } from '@angular/core'

import { ZardDialogRef } from './dialog-ref';

@Directive({
  selector: '[xpDialogClose]',
  host: {
    '(click)': 'close()'
  }
})
export class UiDialogCloseDirective {
  readonly result = input<unknown>(undefined, { alias: 'xpDialogClose' })

  private readonly dialogRef = inject(DialogRef<unknown>, { optional: true })
  private readonly zardDialogRef = inject(ZardDialogRef<unknown, unknown>, { optional: true })

  close(): void {
    const result = this.result();
    this.dialogRef?.close(result)
    this.zardDialogRef?.close(result)
  }
}
