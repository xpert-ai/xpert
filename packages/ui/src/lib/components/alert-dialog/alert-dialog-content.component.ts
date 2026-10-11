import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ZardButtonComponent } from '../button/button.component'
import { XpDialogFrameImports } from '../dialog/dialog-frame.directive'
import { ZardAlertDialogOptions } from './alert-dialog.component'

@Component({
  selector: 'z-alert-dialog-content',
  standalone: true,
  imports: [ZardButtonComponent, ...XpDialogFrameImports],
  template: `
    <div xpDialogLayout="standard">
      @if (data.title || data.closable) {
        <header xpDialogHeader>
          @if (data.title) {
            <h2 xpDialogHeading [id]="dialogRef.id + '-title'">{{ data.title }}</h2>
          }
          @if (data.closable) {
            <button
              z-button
              zType="ghost"
              zSize="icon"
              xpDialogCloseButton
              type="button"
              [attr.aria-label]="data.cancelText ?? 'Cancel'"
              (click)="close(false)"
            >
              <z-icon zType="x" />
            </button>
          }
        </header>
      }
      @if (data.description) {
        <div xpDialogBody>
          <p xpDialogDescription [id]="dialogRef.id + '-description'">{{ data.description }}</p>
        </div>
      }
      <footer xpDialogFooter>
        @if (data.cancelText !== null) {
          <button type="button" data-testid="z-alert-dialog-cancel" z-button zType="outline" (click)="close(false)">
            {{ data.cancelText ?? 'Cancel' }}
          </button>
        }
        @if (data.actionText !== null) {
          <button
            type="button"
            data-testid="z-alert-dialog-action"
            z-button
            [zType]="data.destructive ? 'destructive' : 'default'"
            (click)="close(true)"
          >
            {{ data.actionText ?? 'Continue' }}
          </button>
        }
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZardAlertDialogContentComponent {
  protected readonly data = inject<ZardAlertDialogOptions>(DIALOG_DATA)
  protected readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)

  close(result: boolean) {
    this.dialogRef.close(result)
  }
}
