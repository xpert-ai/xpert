import { DIALOG_DATA } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, Inject, computed, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
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

import { ZardDialogRef } from '@xpert-ai/headless-ui'
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
  template: `<header xpDialogTitle cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
  <h4 style="pointer-events: none;" class="mb-0">
    {{ 'PAC.ACTIONS.Release' | translate: { Default: 'Release' } }}
    {{ 'PAC.KEY_WORDS.Story' | translate: { Default: 'Story' } }}
  </h4>
</header>

<div xpDialogContent class="xpDialogContent w-96">
  <form [formGroup]="form" class="flex flex-col justify-start items-stretch">

    <z-radio-group formControlName="type" class="flex gap-2 my-4">
      <z-radio [value]="1">
      {{ 'PAC.Project.Inner' | translate: {Default: 'Inner'} }}
      </z-radio>
      <z-radio [value]="2">
      {{ 'PAC.Project.Public' | translate: {Default: 'Public'} }}
      </z-radio>
    </z-radio-group>

    <div *ngIf="notAllPublic()" class="flex flex-col mb-2">
      <z-form-message zType="error">
        {{ 'PAC.Project.AllModelsMustBePublic' | translate: { Default: 'All models must be public' } }}
      </z-form-message>

      <ul class="pl-4">
        <li *ngFor="let model of noPublicModels()">{{model.name}}</li>
      </ul>
    </div>

    <ngm-tree-select *ngIf="type() === 1" appearance="fill" searchable displayBehaviour="descriptionOnly"
      formControlName="businessAreaId"
      label="{{ 'PAC.KEY_WORDS.BusinessArea' | translate: { Default: 'Business Area' } }}"
      [treeNodes]="businessArea$ | async"
    ></ngm-tree-select>

    <z-form-field appearance="fill" floatLabel="always" >
      <z-form-label>{{ 'PAC.Project.Name' | translate: { Default: 'Name' } }}</z-form-label>
      <input z-input formControlName="name" required
        placeholder="{{ 'PAC.Project.WhatIsTheName' | translate: { Default: 'What is the name of your project' } }}?"
      />
    </z-form-field>

    <z-form-field appearance="fill" floatLabel="always">
      <z-form-label>
          {{ 'PAC.Project.Description' | translate: { Default: 'Description' } }}
      </z-form-label>
      <textarea z-input formControlName="description"
          placeholder="{{ 'PAC.Project.DescriptionPlaceholder' | translate: { Default: 'Optional, desciption of the project' } }}"
      ></textarea>
    </z-form-field>
  </form>
</div>

<xp-dialog-actions align="end">
  <div ngmButtonGroup>
    <button z-button zType="ghost" xpDialogClose>
      {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
    </button>

    <button z-button zType="default" color="accent" [disabled]="form.invalid || notAllPublic()" (click)="release()">
      {{ 'PAC.Project.Release' | translate: { Default: 'Release' } }}
    </button>
  </div>
</xp-dialog-actions>`,
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
    private _dialogRef: ZardDialogRef<ReleaseStoryDialog>,
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