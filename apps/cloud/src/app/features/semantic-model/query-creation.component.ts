import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, OnInit } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { firstValueFrom } from 'rxjs'
import { ModelQueryService, uuid } from '../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, TranslateModule, FormsModule, ReactiveFormsModule, ...ZardFormImports, DragDropModule, ZardButtonComponent, ZardInputDirective, ButtonGroupDirective, DensityDirective, NgmSelectComponent],
  selector: 'pac-query-creation',
  template: `<header mat-dialog-title cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <h4 style="pointer-events: none;">
        {{ 'PAC.MODEL.CreateQuery' | translate: { Default: 'Create Query' } }}
      </h4>
    </header>

    <div mat-dialog-content>
      <form class="flex flex-col justify-start items-stretch" 
        [formGroup]="formGroup" (ngSubmit)="create()">
        <z-form-field appearance="fill" floatLabel="always">
          <z-form-label>
            {{ 'PAC.KEY_WORDS.Name' | translate: { Default: 'Name' } }}
          </z-form-label>
          <input z-input formControlName="name" placeholder="{{ 'PAC.MODEL.QueryName' | translate: { Default: 'Short name of query' } }}" />
        </z-form-field>

        <z-form-field appearance="fill" floatLabel="always">
          <z-form-label>
            {{ 'PAC.KEY_WORDS.Model' | translate: { Default: 'Model' } }}
          </z-form-label>
          <ngm-select
            formControlName="modelId"
            [placeholder]="
              ('PAC.MODEL.QueryBaseModelPlaceholder' | translate: { Default: 'Which model space do you want query' }) + '?'
            "
            [selectOptions]="(models$ | async)?.map(model => ({ value: model.id, label: model.name }))"
          />
        </z-form-field>

        <button type="submit"></button>
      </form>
    </div>

    <div mat-dialog-actions>
      <div ngmButtonGroup>
        <button z-button zType="outline" mat-dialog-close cdkFocusInitial>
          {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
        </button>
      </div>

      <div ngmButtonGroup>
        <button z-button zType="default" color="accent" [disabled]="formGroup.invalid" (click)="create()">
          {{ 'PAC.ACTIONS.CREATE' | translate: { Default: 'Create' } }}
        </button>
      </div>
    </div> `,
  styles: [``],
  providers: []
})
export class QueryCreationDialogComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  formGroup = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    modelId: new FormControl(null, [Validators.required]),
  })
  public readonly models$ = this.modelsService.getMy()
  constructor(
    public dialogRef: MatDialogRef<QueryCreationDialogComponent>,
    private modelsService: SemanticModelServerService,
    private modelQueryService: ModelQueryService
  ) {}

  ngOnInit(): void {}

  async create() {
    if (!this.formGroup.invalid) {
      const query = await firstValueFrom(
        this.modelQueryService.create({
          ...this.formGroup.value,
          key: uuid(),
        })
      )

      this.dialogRef.close(query)
    }
  }
}
