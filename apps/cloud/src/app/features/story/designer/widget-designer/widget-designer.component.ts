import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { nonNullable } from '@metad/core'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { STORY_DESIGNER_FORM, STORY_DESIGNER_LIVE_MODE } from '@metad/story/designer'
import { TranslateModule } from '@ngx-translate/core'
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
  selector: 'pac-widget-designer',
  templateUrl: './widget-designer.component.html',
  styleUrls: ['./widget-designer.component.scss']
})
export class WidgetDesignerComponent {
  private readonly _settingsComponent = inject(STORY_DESIGNER_FORM)
  private readonly liveMode = inject(STORY_DESIGNER_LIVE_MODE)
  private readonly _cdr = inject(ChangeDetectorRef)

  readonly initial = signal(true)

  formControl = new FormControl()

  private modelSub = (isObservable(this._settingsComponent.model)
    ? this._settingsComponent.model
    : of(this._settingsComponent.model)
  )
    .pipe(
      filter((model) => nonNullable(model) && this.initial()),
      takeUntilDestroyed()
    )
    .subscribe((model) => {
      this.initial.set(false)
      this.formControl.patchValue((<{ component: any; modeling: any }>model).component)
    })

  private valueSub = this.formControl.valueChanges.pipe(debounceTime(500), takeUntilDestroyed()).subscribe((value) => {
    this._settingsComponent.submit.next({ component: value })
  })
}
