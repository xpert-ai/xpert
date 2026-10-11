import { ChangeDetectionStrategy, Component, inject, type ViewContainerRef } from '@angular/core'

import { ZardButtonComponent } from '../button/button.component'
import { XpDialogFrameImports } from '../dialog/dialog-frame.directive'
import { ZardDialogRef } from '../dialog/dialog-ref'
import { Z_MODAL_DATA } from '../dialog/dialog.service'

export interface ZardAlertDialogOptions {
  title?: string
  description?: string
  actionText?: string | null
  cancelText?: string | null
  destructive?: boolean
  closable?: boolean
  maskClosable?: boolean
  width?: string
  customClasses?: string
  viewContainerRef?: ViewContainerRef
}

@Component({
  selector: 'z-alert-dialog',
  standalone: true,
  imports: [ZardButtonComponent, ...XpDialogFrameImports],
  template: `
    <div xpDialogLayout="standard">
      @if (data.title || data.closable) {
        <header xpDialogHeader>
          @if (data.title) {
            <h2 xpDialogHeading>{{ data.title }}</h2>
          }
          @if (data.closable) {
            <button
              z-button
              zType="ghost"
              zSize="icon"
              data-testid="z-alert-dialog-close"
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
        <div [xpDialogBody]="data.title || data.closable ? '' : 'section'">
          <p xpDialogDescription>{{ data.description }}</p>
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
export class ZardAlertDialogComponent {
  protected readonly data = inject<ZardAlertDialogOptions>(Z_MODAL_DATA)
  private readonly dialogRef = inject(ZardDialogRef<ZardAlertDialogComponent, boolean>)

  close(result?: boolean) {
    this.dialogRef.close(result)
  }
}
