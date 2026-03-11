import { Component, inject } from "@angular/core";

import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar";
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
    selector: 'ngm-snack-notification',
    template: `<div class="flex flex-col gap-2">
    <div class="ngm-snack-notification__message text-lg">{{data?.message}}</div>
    <div class="ngm-snack-notification__description opacity-80">{{data?.description}}</div>
</div>
<button z-button zType="ghost" zSize="icon" zShape="circle" class="ngm-snack-notification__close ngm-density__cosy" (click)="close()">
    <z-icon zType="close"></z-icon>
</button>
`,
    styles: [
      `:host {
        display: flex;
        flex-direction: column;
        position: relative;
      }
      .ngm-snack-notification__close {
        position: absolute;
        right: -1rem;
        top: -1rem;
      }
    `,
    ],
    standalone: true,
    imports: [
        ZardButtonComponent,
        ZardIconComponent
    ]
  })
export class NgmNotificationComponent {
  readonly data = inject(MAT_SNACK_BAR_DATA)
  readonly snackBarRef = inject(MatSnackBarRef<NgmNotificationComponent>)
  
  close() {
    this.snackBarRef.dismiss()
  }
}