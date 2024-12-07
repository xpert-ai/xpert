import { DIALOG_DATA } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { toSignal } from '@angular/core/rxjs-interop'
import { ISemanticModel } from '../../@core'
import { MaterialModule } from '../../@shared/material.module'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    FormsModule,
    TranslateModule,
    MaterialModule,
    ButtonGroupDirective,
    DensityDirective
  ],
  selector: 'pac-project-select-model-dialog',
  template: `<header mat-dialog-title cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <h4 style="pointer-events: none;" class="mb-0">
        {{ 'PAC.Project.AddModels' | translate: { Default: 'Add Semantic Models' } }}
      </h4>
    </header>

    <div mat-dialog-content class="mat-dialog-content mat-typography w-96 overflow-y-auto">
      <mat-selection-list displayDensity="cosy" [(ngModel)]="models" [compareWith]="compareWith">
        <mat-list-option *ngFor="let model of models$()" class="rounded-md overflow-hidden" [value]="model">
          {{ model.name }}
        </mat-list-option>
      </mat-selection-list>
    </div>
    <mat-dialog-actions align="end">
      <div ngmButtonGroup>
        <button mat-button mat-dialog-close>
          {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
        </button>

        <button mat-raised-button color="accent" [matDialogClose]="models">
          {{ 'PAC.ACTIONS.Add' | translate: { Default: 'Add' } }}
        </button>
      </div>
    </mat-dialog-actions> `,
  styles: [
    `
      :host {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: stretch;
      }
    `
  ]
})
export class SelectModelDialog {
  private data = inject<{models: ISemanticModel[]}>(DIALOG_DATA)
  private modelsService = inject(SemanticModelServerService)
  public models = []
  public readonly models$ = toSignal(this.modelsService.getMy())

  constructor() {
    this.models = this.data.models ?? []
  }

  compareWith(o1: ISemanticModel, o2: ISemanticModel) {
    return o1.id === o2.id
  }
}
