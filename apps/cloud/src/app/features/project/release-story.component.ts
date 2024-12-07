import { DIALOG_DATA } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, Inject, computed, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialogRef } from '@angular/material/dialog'
import { NgmCommonModule, NgmTreeSelectComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { BusinessAreasService, StoriesService } from '@metad/cloud/state'
import { BehaviorSubject, filter, firstValueFrom, map, startWith, switchMap } from 'rxjs'
import { IStory, StoryStatusEnum, ToastrService, Visibility } from '../../@core'
import { MaterialModule } from '../../@shared/material.module'
import { toSignal } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    NgmCommonModule,
    ButtonGroupDirective,
    NgmTreeSelectComponent
  ],
  selector: 'pac-project-release-story-dialog',
  template: `<header mat-dialog-title cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
  <h4 style="pointer-events: none;" class="mb-0">
    {{ 'PAC.ACTIONS.Release' | translate: { Default: 'Release' } }}
    {{ 'PAC.KEY_WORDS.Story' | translate: { Default: 'Story' } }}
  </h4>
</header>

<div mat-dialog-content class="mat-dialog-content mat-typography w-96">
  <form [formGroup]="form" class="flex flex-col justify-start items-stretch">

    <mat-radio-group formControlName="type" class="flex gap-2 my-4">
      <mat-radio-button [value]="1">
      {{ 'PAC.Project.Inner' | translate: {Default: 'Inner'} }}
      </mat-radio-button>
      <mat-radio-button [value]="2">
      {{ 'PAC.Project.Public' | translate: {Default: 'Public'} }}
      </mat-radio-button>
    </mat-radio-group>

    <div *ngIf="notAllPublic()" class="flex flex-col mb-2">
      <mat-error>
        {{ 'PAC.Project.AllModelsMustBePublic' | translate: { Default: 'All models must be public' } }}
      </mat-error>

      <ul class="pl-4">
        <li *ngFor="let model of noPublicModels()">{{model.name}}</li>
      </ul>
    </div>

    <ngm-tree-select *ngIf="type() === 1" appearance="fill" searchable displayBehaviour="descriptionOnly"
      formControlName="businessAreaId"
      label="{{ 'PAC.KEY_WORDS.BusinessArea' | translate: { Default: 'Business Area' } }}"
      [treeNodes]="businessArea$ | async"
    ></ngm-tree-select>

    <mat-form-field appearance="fill" floatLabel="always" >
      <mat-label>{{ 'PAC.Project.Name' | translate: { Default: 'Name' } }}</mat-label>
      <input matInput formControlName="name" required
        placeholder="{{ 'PAC.Project.WhatIsTheName' | translate: { Default: 'What is the name of your project' } }}?"
      />
    </mat-form-field>

    <mat-form-field appearance="fill" floatLabel="always">
      <mat-label>
          {{ 'PAC.Project.Description' | translate: { Default: 'Description' } }}
      </mat-label>
      <textarea matInput formControlName="description"
          placeholder="{{ 'PAC.Project.DescriptionPlaceholder' | translate: { Default: 'Optional, desciption of the project' } }}"
      ></textarea>
    </mat-form-field>
  </form>
</div>

<mat-dialog-actions align="end">
  <div ngmButtonGroup>
    <button mat-button mat-dialog-close>
      {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
    </button>

    <button
      mat-raised-button
      color="accent"
      [disabled]="form.invalid || notAllPublic()"
      (click)="release()"
    >
      {{ 'PAC.Project.Release' | translate: { Default: 'Release' } }}
    </button>
  </div>
</mat-dialog-actions>`,
  styles: [``]
})
export class ReleaseStoryDialog {
  private readonly storiesService = inject(StoriesService)

  form = new FormGroup({
    type: new FormControl(null),
    name: new FormControl(null, [Validators.required]),
    description: new FormControl(null),
    businessAreaId: new FormControl(null),
  })

  public readonly type = toSignal(this.form.get('type').valueChanges)

  public readonly businessArea$ = this.businessAreaService.getMyAreasTree(true).pipe(startWith([]))

  story$ = new BehaviorSubject<IStory>(null)
  public readonly semanticModels = toSignal(this.story$.pipe(
    filter(nonNullable),
    switchMap(story => this.storiesService.getOne(story.id, ['models'])),
    map((story) => story.models)
  ))

  public readonly noPublicModels = computed(() => {
    return this.semanticModels()?.filter(model => model.visibility !== Visibility.Public)
  })

  public readonly notAllPublic = computed(() => {
    return this.type() === 2 && this.noPublicModels()?.length > 0
  })

  constructor(
    @Inject(DIALOG_DATA) public data: {
      story: IStory
    },
    private _dialogRef: MatDialogRef<ReleaseStoryDialog>,
    private businessAreaService: BusinessAreasService,
    private _toastrService: ToastrService
  ) {
    this.story$.next(this.data.story)
    this.form.patchValue(pick(this.data.story, 'name', 'description', 'businessAreaId'))
  }

  async release() {
    if (this.form.valid) {
      await firstValueFrom(this.storiesService.update(this.data.story.id, this.type() === 1 ? {
        name: this.form.value.name,
        description: this.form.value.description,
        businessAreaId: this.form.value.businessAreaId,
        status: StoryStatusEnum.RELEASED,
        visibility: Visibility.Secret,
      } : {
        name: this.form.value.name,
        description: this.form.value.description,
        visibility: Visibility.Public,
        businessAreaId: null,
        status: StoryStatusEnum.RELEASED
      }))

      this._toastrService.success('PAC.Project.StoryReleased', {Default: 'Story Released!'})
      this._dialogRef.close()
    }
  }
}