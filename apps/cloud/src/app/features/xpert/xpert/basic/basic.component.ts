import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormArray, FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IfAnimation,
  AiModelTypeEnum,
  omitXpertRelations,
  TagCategoryEnum,
  ToastrService,
  TXpertTeamDraft,
  XpertParameterTypeEnum,
  XpertService,
  XpertTypeEnum
} from 'apps/cloud/src/app/@core'
import { CopilotModelSelectComponent, MaterialModule, TagSelectComponent } from 'apps/cloud/src/app/@shared'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertComponent } from '../xpert.component'
import { injectGetXpertTeam } from '../../utils'
import { derivedAsync } from 'ngxtension/derived-async'

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
    MaterialModule,

    NgmDensityDirective,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    TagSelectComponent,
    NgmInputComponent
  ],
  templateUrl: './basic.component.html',
  styleUrl: './basic.component.scss',
  animations: [IfAnimation]
})
export class XpertBasicComponent {
  eXpertTypeEnum = XpertTypeEnum
  eModelType = AiModelTypeEnum
  eTagCategoryEnum = TagCategoryEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly xpertComponent = inject(XpertComponent)
  readonly xpertService = inject(XpertService)
  readonly getXpertTeam = injectGetXpertTeam()
  readonly #fb = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)

  readonly xpertId = this.xpertComponent.paramId

  readonly xpert = derivedAsync(() => {
    return this.xpertId() ? this.getXpertTeam(this.xpertId()) : null
  })
  readonly draft = computed(() => {
    if (this.xpert()) {
      return this.xpert().draft ?? {team: omitXpertRelations(this.xpert())}
    }
    return null
  })
  readonly type = computed(() => this.xpert()?.type)
  readonly team = computed(() => this.type() === XpertTypeEnum.Agent ? this.draft()?.team : this.xpert())

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

  readonly loading = signal(false)

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
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    } else {
      this.xpertService.update(this.xpertId(), {
        ...this.form.value
      }).subscribe({
        next: (value) => {
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully!' })
          this.loading.set(false)
          this.form.markAsPristine()
          this.xpertComponent.refresh()
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }
}
