import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormArray, FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ZardButtonComponent, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { IsDirty } from '@xpert-ai/headless-ui'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { XpDensityDirective } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { TCopilotModel } from '@xpert-ai/contracts'
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
import { XpertComponent } from '../xpert.component'
import { XpertService } from '../xpert.service'

@Component({
  selector: 'xpert-basic',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    XpDensityDirective,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    TagSelectComponent,
    XpSpinComponent
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
  readonly xpertService = inject(XpertService)
  readonly xpertAPI = inject(XpertAPIService)
  // readonly getXpertTeam = injectGetXpertTeam()
  readonly #fb = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)

  readonly xpertId = this.xpertService.paramId
  readonly xpert = this.xpertService.xpert

  readonly loading = signal(false)
  // readonly xpert = derivedFrom(
  //   [this.xpertId],
  //   pipe(
  //     switchMap(([id]) => {
  //       if (id) {
  //         this.loading.set(true)
  //         return this.getXpertTeam(this.xpertId()).pipe(tap(() => this.loading.set(false)))
  //       }
  //       return of(null)
  //     })
  //   ),
  //   { initialValue: null }
  // )

  readonly draft = computed(() => {
    if (this.xpert()) {
      return this.xpert().draft ?? { team: omitXpertRelations(this.xpert()) }
    }
    return null
  })
  readonly type = computed(() => this.xpert()?.type)
  readonly workspaceDataScope = computed(() => this.xpert()?.workspaceDataScope ?? 'shared')
  readonly team = computed(() => (this.type() === XpertTypeEnum.Agent ? this.draft()?.team : this.xpert()))

  readonly isExpanded = model<boolean>(false)

  readonly form = this.#fb.group({
    name: this.#fb.control(null),
    title: this.#fb.control(null),
    description: this.#fb.control(null),
    avatar: this.#fb.control(null),
    tags: this.#fb.control(null),
    copilotModel: this.#fb.control<TCopilotModel | null>(null, Validators.required),
    allowedModels: this.#fb.array<FormControl<TCopilotModel | null>>([])
    // starters: this.#fb.array([
    //   this.#fb.control(null),
    //   this.#fb.control(null),
    //   this.#fb.control(null),
    //   this.#fb.control(null)
    // ])
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
  get allowedModels() {
    return this.form.get('allowedModels') as FormArray<FormControl<TCopilotModel | null>>
  }
  // get starters() {
  //   return this.form.get('starters') as FormArray
  // }

  constructor() {
    effect(() => {
      if (this.team()) {
        const team = this.team()
        this.form.patchValue(team)
        this.form.setControl(
          'allowedModels',
          this.#fb.array(
            (team.options?.modelSelection?.allowedModels ?? []).map((model) =>
              this.#fb.control<TCopilotModel | null>(
                { ...model, options: model.options ? { ...model.options } : undefined },
                Validators.required
              )
            )
          )
        )
        this.form.markAsPristine()
      }
    })
  }

  isDirty(): boolean {
    return this.form.dirty
  }

  toggleExpand() {
    this.isExpanded.update((state) => !state)
  }

  addAllowedModel() {
    this.allowedModels.push(this.#fb.control<TCopilotModel | null>(null, Validators.required))
    this.allowedModels.markAsDirty()
  }

  removeAllowedModel(index: number) {
    this.allowedModels.removeAt(index)
    this.allowedModels.markAsDirty()
  }

  moveAllowedModel(index: number, offset: -1 | 1) {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= this.allowedModels.length) {
      return
    }
    const control = this.allowedModels.at(index)
    this.allowedModels.removeAt(index)
    this.allowedModels.insert(nextIndex, control)
    this.allowedModels.markAsDirty()
  }

  dropAllowedModel(event: CdkDragDrop<FormControl<TCopilotModel | null>[]>) {
    if (event.previousIndex === event.currentIndex) {
      return
    }
    const control = this.allowedModels.at(event.previousIndex)
    this.allowedModels.removeAt(event.previousIndex)
    this.allowedModels.insert(event.currentIndex, control)
    this.allowedModels.markAsDirty()
  }

  updateAllowedModel(index: number, model: TCopilotModel | null) {
    if (model && this.isDuplicateModel(model, index)) {
      this.#toastr.error('XP.Xpert.ModelSelection.Duplicate', '', {
        Default: 'The Primary model and selectable models must be unique.'
      })
      this.allowedModels.at(index).setValue(null)
      return
    }
    this.allowedModels.at(index).setValue(model)
    this.allowedModels.at(index).markAsDirty()
  }

  saveDraft() {
    this.loading.set(true)
    const { allowedModels, ...basicValue } = this.form.getRawValue()
    const options = {
      ...(this.team()?.options ?? {}),
      modelSelection: {
        allowedModels: this.normalizeAllowedModels(allowedModels)
      }
    }
    if (this.type() === XpertTypeEnum.Agent) {
      this.xpertAPI
        .upadteDraft(this.xpertId(), {
          team: {
            ...omitXpertRelations(this.xpert()),
            ...(this.draft()?.team ?? {}),
            ...basicValue,
            options
          }
        } as TXpertTeamDraft)
        .subscribe({
          next: (value) => {
            this.#toastr.success('XP.Messages.SavedDraft', { Default: 'Saved draft!' })
            this.loading.set(false)
            this.form.markAsPristine()
            this.xpertService.refresh()
            this.close()
            // this.#router.navigate(['../agents'], { relativeTo: this.#route })
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    } else {
      this.xpertAPI
        .update(this.xpertId(), {
          ...basicValue,
          options
        })
        .subscribe({
          next: (value) => {
            this.#toastr.success('XP.Messages.UpdatedSuccessfully', { Default: 'Updated successfully!' })
            this.loading.set(false)
            this.form.markAsPristine()
            this.xpertService.refresh()
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

  private normalizeAllowedModels(models: Array<TCopilotModel | null>): TCopilotModel[] {
    const primaryIdentity = this.modelIdentity(this.copilotModel.value)
    const identities = new Set<string>()
    return models.filter((model): model is TCopilotModel => {
      const identity = this.modelIdentity(model)
      if (!identity || identity === primaryIdentity || identities.has(identity)) {
        return false
      }
      identities.add(identity)
      return true
    })
  }

  private isDuplicateModel(model: TCopilotModel, currentIndex: number): boolean {
    const identity = this.modelIdentity(model)
    if (!identity) {
      return false
    }
    if (identity === this.modelIdentity(this.copilotModel.value)) {
      return true
    }
    return this.allowedModels.controls.some(
      (control, index) => index !== currentIndex && this.modelIdentity(control.value) === identity
    )
  }

  private modelIdentity(model: TCopilotModel | null | undefined): string | null {
    const copilotId = model?.copilotId?.trim()
    const modelName = model?.model?.trim()
    if (!copilotId || !modelName) {
      return null
    }
    return `${copilotId}\u0000${model.modelType ?? AiModelTypeEnum.LLM}\u0000${modelName}`
  }
}
