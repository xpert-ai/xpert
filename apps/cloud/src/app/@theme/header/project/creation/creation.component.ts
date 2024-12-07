import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { ISemanticModel } from 'apps/cloud/src/app/@core'
import { combineLatest, debounceTime, map, startWith } from 'rxjs'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
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
        overflow: hidden;
      }
    `
  ]
})
export class ProjectCreationComponent {
  private modelsService = inject(SemanticModelServerService)

  form = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    description: new FormControl(null, []),
    models: new FormControl(null, [Validators.required])
  })
  get models() {
    return this.form.get('models') as FormControl
  }
  searchControl = new FormControl(null)

  public models$ = combineLatest([
    this.modelsService.getMy(),
    this.searchControl.valueChanges.pipe(startWith(''), debounceTime(300))
  ]).pipe(
    map(([models, search]) => {
      return models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()))
    })
  )

  compareWith(o1: ISemanticModel, o2: ISemanticModel) {
    return o1.id === o2.id
  }
}
