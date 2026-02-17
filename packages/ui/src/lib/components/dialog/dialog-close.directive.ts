import { DialogRef } from '@angular/cdk/dialog'
import { Directive, inject, input } from '@angular/core'

@Directive({
  selector: '[xpDialogClose]',
  host: {
    '(click)': 'close()'
  }
})
export class UiDialogCloseDirective {
  readonly result = input<unknown>(undefined, { alias: 'xpDialogClose' })

  private readonly dialogRef = inject(DialogRef<unknown>, { optional: true })

  close(): void {
    this.dialogRef?.close(this.result())
  }
}
