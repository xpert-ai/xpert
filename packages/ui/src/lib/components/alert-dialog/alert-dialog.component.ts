import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { type ViewContainerRef } from '@angular/core';

import { ZardButtonComponent } from '../button/button.component';
import { Z_MODAL_DATA } from '../dialog/dialog.service';
import { ZardDialogRef } from '../dialog/dialog-ref';

export interface ZardAlertDialogOptions {
  title?: string;
  description?: string;
  actionText?: string | null;
  cancelText?: string | null;
  destructive?: boolean;
  closable?: boolean;
  maskClosable?: boolean;
  width?: string;
  customClasses?: string;
  viewContainerRef?: ViewContainerRef;
}

@Component({
  selector: 'z-alert-dialog',
  standalone: true,
  imports: [ZardButtonComponent],
  template: `
    <div class="flex flex-col gap-6">
      @if (data.title || data.description) {
        <div class="flex flex-col gap-2 text-left">
          @if (data.title) {
            <h2 class="text-lg font-semibold tracking-tight">{{ data.title }}</h2>
          }

          @if (data.description) {
            <p class="text-muted-foreground text-sm leading-6">{{ data.description }}</p>
          }
        </div>
      }

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZardAlertDialogComponent {
  protected readonly data = inject<ZardAlertDialogOptions>(Z_MODAL_DATA);
  private readonly dialogRef = inject(ZardDialogRef<ZardAlertDialogComponent, boolean>);

  close(result: boolean) {
    this.dialogRef.close(result);
  }
}
