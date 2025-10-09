import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormArray, FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { IsDirty } from '@metad/core'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getErrorMessage,
  IfAnimation,
  omitXpertRelations,
  TagCategoryEnum,
  ToastrService,
  TXpertTeamDraft,
  XpertParameterTypeEnum,
  XpertAPIService,
  XpertTypeEnum
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { TagSelectComponent } from 'apps/cloud/src/app/@shared/tag'
import { derivedFrom } from 'ngxtension/derived-from'
import { of, pipe, switchMap, tap } from 'rxjs'
import { injectGetXpertTeam } from '../../utils'
import { XpertComponent } from '../xpert.component'
import { DialogRef } from '@angular/cdk/dialog'

@Component({
  selector: 'xpert-basic',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,
    MatInputModule,

    NgmDensityDirective,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    TagSelectComponent,
    NgmInputComponent,
    NgmSpinComponent
  ],
  templateUrl: './basic.component.html',
  styleUrl: './basic.component.scss',
  animations: [IfAnimation]
})
export class XpertBasicComponent implements IsDirty {
  eXpertTypeEnum = XpertTypeEnum
  eModelType = AiModelTypeEnum
  eTagCategoryEnum = TagCategoryEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly xpertComponent = inject(XpertComponent)
  readonly xpertService = inject(XpertAPIService)
  readonly getXpertTeam = injectGetXpertTeam()
  readonly #fb = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)

  readonly xpertId = this.xpertComponent.paramId

  readonly loading = signal(false)
  readonly xpert = derivedFrom(
    [this.xpertId],
    pipe(
      switchMap(([id]) => {
        if (id) {
          this.loading.set(true)
          return this.getXpertTeam(this.xpertId()).pipe(tap(() => this.loading.set(false)))
        }
        return of(null)
      })
    ),
    { initialValue: null }
  )

  readonly draft = computed(() => {
    if (this.xpert()) {
      return this.xpert().draft ?? { team: omitXpertRelations(this.xpert()) }
    }
    return null
  })
  readonly type = computed(() => this.xpert()?.type)
  readonly team = computed(() => (this.type() === XpertTypeEnum.Agent ? this.draft()?.team : this.xpert()))

  readonly isExpanded = model<boolean>(false)

  readonly form = this.#fb.group({
    name: this.#fb.control(null),
    title: this.#fb.control(null),
    description: this.#fb.control(null),
    avatar: this.#fb.control(null),
    tags: this.#fb.control(null),
    copilotModel: this.#fb.control(null),
    starters: this.#fb.array([
      this.#fb.control(null),
      this.#fb.control(null),
      this.#fb.control(null),
      this.#fb.control(null)
    ])
  })
  get name() {
    return this.form.get('name').value
  }
  get avatar() {
    return this.form.get('avatar') as FormControl
  }
  get title() {
    return this.form.get('title') as FormControl
  }
  get description() {
    return this.form.get('description') as FormControl
  }
  get tags() {
    return this.form.get('tags') as FormControl
  }
  get copilotModel() {
    return this.form.get('copilotModel') as FormControl
  }
  get starters() {
    return this.form.get('starters') as FormArray
  }

  constructor() {
    effect(
      () => {
        if (this.team()) {
          this.form.patchValue(this.team())
          this.form.markAsPristine()
        }
      },
      { allowSignalWrites: true }
    )
  }

  isDirty(): boolean {
    return this.form.dirty
  }

  toggleExpand() {
    this.isExpanded.update((state) => !state)
  }

  saveDraft() {
    this.loading.set(true)
    if (this.type() === XpertTypeEnum.Agent) {
      this.xpertService
        .upadteDraft(this.xpertId(), {
          team: {
            ...omitXpertRelations(this.xpert()),
            ...(this.draft()?.team ?? {}),
            ...this.form.value
          }
        } as TXpertTeamDraft)
        .subscribe({
          next: (value) => {
            this.#toastr.success('PAC.Messages.SavedDraft', { Default: 'Saved draft!' })
            this.loading.set(false)
            this.form.markAsPristine()
            this.xpertComponent.refresh()
            this.close()
            // this.#router.navigate(['../agents'], { relativeTo: this.#route })
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    } else {
      this.xpertService
        .update(this.xpertId(), {
          ...this.form.value
        })
        .subscribe({
          next: (value) => {
            this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully!' })
            this.loading.set(false)
            this.form.markAsPristine()
            this.xpertComponent.refresh()
            this.close()
            // this.#router.navigate(['../agents'], { relativeTo: this.#route })
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    }
  }

  close() {
    this.#dialogRef.close()
  }
}
