import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { STORY_DESIGNER_FORM, STORY_DESIGNER_LIVE_MODE } from '@metad/story/designer'
import { debounceTime, filter, isObservable, of } from 'rxjs'
import { DesignerWidgetComponent } from '../widget/widget.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    InlineSearchComponent,

    AppearanceDirective,

    DesignerWidgetComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-page-designer',
  templateUrl: './page-designer.component.html',
  styleUrls: ['./page-designer.component.scss']
})
export class PageDesignerComponent {
  private readonly _settingsComponent = inject(STORY_DESIGNER_FORM)
  private readonly liveMode = inject(STORY_DESIGNER_LIVE_MODE)
  private readonly _cdr = inject(ChangeDetectorRef)

  initial = true

  formControl = new FormControl()

  private modelSub = (isObservable(this._settingsComponent.model)
    ? this._settingsComponent.model
    : of(this._settingsComponent.model)
  )
    .pipe(filter((model) => !!model && this.initial))
    .subscribe((model) => {
      this.initial = false
      this.formControl.patchValue(model)
    })

  constructor() {
    this.formControl.valueChanges.pipe(debounceTime(500)).subscribe((value) => {
      this._settingsComponent.submit.next(value)
    })
  }
}
