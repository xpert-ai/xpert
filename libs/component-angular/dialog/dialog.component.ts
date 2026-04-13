import { Component, EventEmitter, Input, Output } from '@angular/core'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { ButtonGroupDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { FormGroup } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { ZardButtonComponent, ZardDialogModule } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ZardDialogModule,
    ZardButtonComponent,
    DragDropModule,
    TranslateModule,
    ButtonGroupDirective
],
  selector: 'ngm-dialog',
  template: `<header xpDialogTitle cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <span style="pointer-events: none;">{{ title }}</span>
    </header>

    <div xpDialogContent class="flex-1">
      <ng-content></ng-content>
    </div>

    <div xpDialogActions align="end">
      <div ngmButtonGroup>
        <button z-button zType="ghost" xpDialogClose cdkFocusInitial (click)="cancel.emit()">
          {{ cancelLabel ?? ('COMPONENTS.COMMON.CANCEL' | translate: {Default: 'Cancel'}) }}
        </button>
        <button z-button zType="default" [disabled]="form?.invalid" (click)="onApply()">
          {{ applyLabel ?? ('COMPONENTS.COMMON.Apply' | translate: {Default: 'Apply'}) }}
        </button>
      </div>
    </div>`,
  host: {
    class: 'ngm-dialog'
  },
  styles: [
    `
      :host {
        flex: 1;
        max-height: 100%;
        display: flex;
        flex-direction: column;
      }
    `
  ]
})
export class NgmDialogComponent {
  
  @Input() title: string
  @Input() applyLabel: string
  @Input() cancelLabel: string
  @Input() form: FormGroup

  @Output() apply = new EventEmitter()
  @Output() cancel = new EventEmitter()

  onApply() {
    this.apply.emit(this.form?.value)
  }
}
