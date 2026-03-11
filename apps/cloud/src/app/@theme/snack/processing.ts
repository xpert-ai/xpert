import { CommonModule } from '@angular/common'
import { Component, Inject } from '@angular/core'

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar'
import { DensityDirective } from '@metad/ocap-angular/core'
import { timer } from 'rxjs'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, ZardIconComponent, ZardButtonComponent, DensityDirective],
  template: `<div class="flex justify-start items-center">
    <ng-container [ngSwitch]="status">
      <mat-spinner *ngSwitchCase="'processing'" [diameter]="20"></mat-spinner>
      <z-icon *ngSwitchCase="'done'" class="text-green-500" zType="done"></z-icon>
      <z-icon *ngSwitchCase="'error'" color="warn" zType="error_outline"></z-icon>
    </ng-container>

    <div class="flex-1">
      {{ information }}
    </div>

    <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy" (click)="cancel()">
      <z-icon zType="close"></z-icon>
    </button>
  </div>`,
  styles: []
})
export class SnackProcessingComponent {
  status: 'processing' | 'done' | 'error' = 'processing'
  information = ''
  constructor(
    private _snackBarRef: MatSnackBarRef<SnackProcessingComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: any
  ) {
    this.information = data.message
  }

  done(message: string) {
    this.status = 'done'
    this.information = message
    timer(2000).subscribe(() => this._snackBarRef.dismiss())
  }

  cancel() {
    this._snackBarRef.dismissWithAction()
  }

  error(err) {
    this.status = 'error'
    this.information = err.message
    timer(3000).subscribe(() => this._snackBarRef.dismiss())
  }
}
