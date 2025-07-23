import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { SemanticModelServerService, Store } from '@metad/cloud/state'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, injectToastr, ISemanticModel, ProjectAPIService } from 'apps/cloud/src/app/@core'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'
import { combineLatest, debounceTime, map, startWith } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    DensityDirective,
    ButtonGroupDirective,
    NgmHighlightDirective,
    InlineSearchComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-project-creation',
  templateUrl: `./creation.component.html`,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: row;
        flex: 1;
        min-width: 300px;
        max-height: 80vh;
        overflow: hidden;
      }
    `
  ]
})
export class ProjectCreationComponent {
  private modelsService = inject(SemanticModelServerService)
  readonly projectAPI = inject(ProjectAPIService)
  readonly store = inject(Store)
  readonly #dialogRef = inject(DialogRef)
  readonly #toastr = injectToastr()

  form = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    description: new FormControl(null, []),
    models: new FormControl(null, [Validators.required])
  })
  get models() {
    return this.form.get('models') as FormControl
  }
  searchControl = new FormControl(null)
  get highlight() {
    return this.searchControl.value
  }

  public models$ = combineLatest([
    this.modelsService.getMy(),
    this.searchControl.valueChanges.pipe(startWith(''), debounceTime(300))
  ]).pipe(
    map(([models, search]) =>
      models.filter(
        (model) =>
          model.name.toLowerCase().includes(search.toLowerCase()) ||
          model.description?.toLowerCase().includes(search.toLowerCase())
      )
    )
  )

  readonly creating = signal(false)

  compareWith(o1: ISemanticModel, o2: ISemanticModel) {
    return o1.id === o2.id
  }

  close() {
    this.#dialogRef.close()
  }

  apply() {
    this.creating.set(true)
    const newProject = this.form.value
    const userId = this.store.user.id
    this.projectAPI
      .create({
        ...newProject,
        models: newProject.models.map((model) => ({ id: model.id })),
        ownerId: userId
      })
      .subscribe({
        next: (project) => {
          this.creating.set(false)
          this.#dialogRef.close(project)
        },
        error: (error) => {
          this.creating.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }
}
