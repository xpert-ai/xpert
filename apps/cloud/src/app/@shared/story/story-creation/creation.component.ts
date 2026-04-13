
import { Component, Inject, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { BusinessAreasService, SemanticModelServerService, StoriesService } from '@xpert-ai/cloud/state'
import { ButtonGroupDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour, SemanticModel, TreeNodeInterface } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, distinctUntilChanged, map, startWith } from 'rxjs/operators'
import { ICollection, ISemanticModel } from '../../../@core'
import { InlineSearchComponent, XpTreeSelectComponent } from '../../form-fields'
import { SharedUiModule } from '../../ui.module'

import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    SharedUiModule,
    ButtonGroupDirective,
    XpTreeSelectComponent,
    DensityDirective,
    InlineSearchComponent
],
  selector: 'pac-story-creation',
  templateUrl: './creation.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: row;
        width: 100%;
        max-width: 100%;
        max-height: calc(100vh - 2rem);
        overflow: hidden;
        box-sizing: border-box;
      }

      @media (max-width: 767px) {
        :host {
          flex-direction: column;
        }
      }
    `
  ]
})
export class StoryCreationComponent {
  DisplayBehaviour = DisplayBehaviour

  private readonly storiesService = inject(StoriesService)

  form = new FormGroup({
    models: new FormControl(null, [Validators.required]),
    name: new FormControl('', [Validators.required]),
    description: new FormControl(''),
    collectionId: new FormControl(null)
  })
  get modelsControl() {
    return this.form.get('models') as FormControl
  }
  collections: TreeNodeInterface<ICollection>[]
  private _models: ISemanticModel[]
  // models: ISemanticModel[]

  searchControl = new FormControl(null)

  public readonly businessArea$ = this.businessAreaService.getMyAreasTree(true).pipe(startWith([]))

  readonly models = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      distinctUntilChanged(),
      debounceTime(300),
      map((search) => {
        const filteredModels = this._models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()))
        const selectedModels = this.modelsControl.value ?? []

        selectedModels.forEach((selected) => {
          if (!filteredModels.some((model) => this.compareWithModel(model, selected))) {
            filteredModels.push(selected)
          }
        })

        return filteredModels
      })
    )
  )

  constructor(
    private businessAreaService: BusinessAreasService,
    private modelsService: SemanticModelServerService,
    @Inject(Z_MODAL_DATA)
    public data: {
      story: {
        id?: string
        collectionId: string
        name?: string
        description?: string
        models: ISemanticModel[]
      }
      models: ISemanticModel[]
      collections: TreeNodeInterface<ICollection>[]
    },
    public dialogRef: ZardDialogRef<StoryCreationComponent>
  ) {
    this._models = this.data.models
    this.collections = this.data.collections

    if (!this._models) {
      this.modelsService
        .getMy()
        .pipe(takeUntilDestroyed())
        .subscribe((models) => {
          this._models = models
          this.searchControl.setValue('')
        })
    }
    if (this.data.story?.id) {
      this.storiesService
        .getOne(this.data.story.id, ['models'])
        .pipe(takeUntilDestroyed())
        .subscribe((story) => {
          this.form.patchValue({ ...story })
        })
    } else if (this.data.story) {
      this.form.patchValue({ ...this.data.story })
    }
  }

  compareWithModel(a: { id?: string }, b: { id?: string }) {
    return a?.id === b?.id
  }

  onApply() {
    if (this.form.valid) {
      this.dialogRef.close({
        ...this.form.value,
        models: this.form.value.models.map((model) => ({ id: model.id }))
      })
    }
  }
}
