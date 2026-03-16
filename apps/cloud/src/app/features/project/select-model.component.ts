import { DIALOG_DATA } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ButtonGroupDirective, DensityDirective, mergeSelectedValues } from '@metad/ocap-angular/core'
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
  template: `<header xpDialogTitle cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <h4 style="pointer-events: none;" class="mb-0">
        {{ 'PAC.Project.AddModels' | translate: { Default: 'Add Semantic Models' } }}
      </h4>
    </header>

    <div xpDialogContent class="xpDialogContent w-96 overflow-y-auto">
      <ul class="ngm-cdk-listbox" cdkListbox [(ngModel)]="models" [cdkListboxMultiple]="true" [cdkListboxCompareWith]="compareWith">
        @for (model of listboxModels(); track model.id) {
          <li class="ngm-cdk-option rounded-md overflow-hidden" [cdkOption]="model">
            {{ model.name }}
          </li>
        }
      </ul>
    </div>
    <xp-dialog-actions align="end">
      <div ngmButtonGroup>
        <button z-button zType="ghost" xpDialogClose>
          {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
        </button>

        <button z-button zType="default" color="accent" [xpDialogClose]="models">
          {{ 'PAC.ACTIONS.Add' | translate: { Default: 'Add' } }}
        </button>
      </div>
    </xp-dialog-actions> `,
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
  public readonly listboxModels = computed(() => mergeSelectedValues(this.models$(), this.models, this.compareWith))

  constructor() {
    this.models = this.data.models ?? []
  }

  compareWith(o1: ISemanticModel, o2: ISemanticModel) {
    return o1.id === o2.id
  }
}
