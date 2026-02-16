import { animate, style, transition, trigger } from '@angular/animations'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, Output, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FormlyFieldConfig, FormlyFormOptions, FormlyModule } from '@ngx-formly/core'
import { cloneDeep, isEqual } from 'lodash-es'
import { EMPTY, Observable, Subject, isObservable, of, timer } from 'rxjs'
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  skipUntil,
  switchMap,
} from 'rxjs/operators'
import {
  DesignerSchema,
  STORY_DESIGNER_FORM,
  STORY_DESIGNER_LIVE_MODE,
  STORY_DESIGNER_SCHEMA,
  SettingsComponent
} from '../types'

/**
 * @deprecated use NgmDesignerFormComponent instead
 * 
 */
@Component({
  standalone: true,
  selector: 'ngm-component-settings',
  templateUrl: 'formly-form.component.html',
  styleUrls: ['formly-form.component.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule],
  animations: [
    trigger('settingsComponent', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate(300, style({ transform: 'translateX(0)' }))
      ]),
      transition(':leave', [animate(200, style({ 'transform-origin': 'center', transform: 'scale(0.5)' }))])
    ])
  ]
})
export class NxComponentSettingsComponent {
  // @HostBinding('@settingsComponent') public settingsComponent
  private readonly destroyRef = inject(DestroyRef)
  private _settingsComponent: SettingsComponent = inject(STORY_DESIGNER_FORM)
  private schema: DesignerSchema = inject(STORY_DESIGNER_SCHEMA)
  public liveMode: boolean = inject(STORY_DESIGNER_LIVE_MODE)

  private _modelChange$ = new Subject<unknown>()
  @Output() modelChange = this._modelChange$.pipe(debounceTime(500))

  initial = true
  model = {}

  options: FormlyFormOptions = {}

  public readonly title$ = this.schema.getTitle()

  public fields$: Observable<{ fields: FormlyFieldConfig[]; formGroup: FormGroup }[]> = this.schema.getSchema().pipe(
    map((fields) => [{ fields, formGroup: new FormGroup({}) }]),
    catchError((err) => {
      console.error(err)
      return EMPTY
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly formlyForms = toSignal(this.fields$)

  private modelSub = (isObservable(this._settingsComponent.model) ? this._settingsComponent.model : of(this._settingsComponent.model))
    .pipe(
      filter((model) => !!model && (this.initial || !isEqual(model, this.model))),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe((model) => {
      this.initial = false
      this.model = cloneDeep(model)
      this.schema.model = model
    })
  private valueSub = this.fields$
    .pipe(
      switchMap((items) => {
        const { formGroup } = items[0]
        return formGroup.valueChanges
      }),
      // 跳过初始值
      skipUntil(timer(1000)),
      debounceTime(500),
      distinctUntilChanged(isEqual),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe((value) => {
      this.schema.model = value
      if (this.liveMode && !this.initial) {
        // 为什么原来不是 Submit form Value ?
        this.onSubmit(value)
      }
    })

  onSubmit(value?) {
    this._settingsComponent.submit.next(value ?? this.model)
  }

  onModelChange(value) {
    this._modelChange$.next(value)
  }
}
