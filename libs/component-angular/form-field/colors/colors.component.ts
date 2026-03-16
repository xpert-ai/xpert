
import { animate, query, stagger, style, transition, trigger } from '@angular/animations'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, forwardRef, inject } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete'

import { ZardButtonComponent, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Subject, debounceTime } from 'rxjs'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

const listEnterAnimation = trigger('listEnterAnimation', [
  transition('* <=> *', [
    query(':enter', [style({ opacity: 0 }), stagger('20ms', animate('100ms ease-out', style({ opacity: 1 })))], {
      optional: true
    })
  ])
])

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardInputDirective,
    MatAutocompleteModule,
    ZardIconComponent,
    ZardButtonComponent,
    DensityDirective
],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-colors',
  templateUrl: './colors.component.html',
  styleUrls: ['./colors.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmColorsComponent)
    }
  ],
  animations: [listEnterAnimation]
})
export class NgmColorsComponent implements ControlValueAccessor {
  private readonly _cdr = inject(ChangeDetectorRef)

  @Input() label: string
  @Input() placeholder: string
  @Input() options: { label: string; colors: Array<{colors: string[]; keywords?: string[]}> }[]

  @Input() disabled = false

  value = null

  /**
   * 由于 blur 事件在 optionSelected 事件之前触发， 所以需要等待一段时间，然后再响应 blur 事件才能拿到选择的值
   * @todo 为了使用 debounceTime 方法，有没有其他简便方式 in signal ？？
   */
  private readonly onBlur$ = new Subject<{event: FocusEvent; autocomplete: MatAutocompleteTrigger}>()

  private _onChange: (value) => void
  private _onTouched: (value) => void

  private onBlurSub = this.onBlur$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(({ event, autocomplete }) => {
    const value = (<HTMLInputElement>event.target).value
    if (value !== this.value?.toString()) {
      if (typeof value === 'string') {
        this.value = value.split(',').reduce((acc, cur) => {
          cur.split(' ').forEach((color) => {
            if (color.trim()) {
              acc.push(color.trim())
            }
          })
          return acc
        }, [])
      } else {
        this.value = value
      }
    }

    this.emitChange()

    autocomplete.closePanel()
    
    // debounceTime 延时后就需要使用 detectChanges 手动发现脏数据
    this._cdr.detectChanges()
  })

  writeValue(obj: any): void {
    this.value = obj
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  onChange(value) {
    if (Array.isArray(value)) {
      this.value = value

      this._onChange(this.value?.length ? this.value : null)
    }
  }

  onBlur(event: FocusEvent, autocomplete?: MatAutocompleteTrigger) {
    this.onBlur$.next({
      event,
      autocomplete
    })
  }

  onOptionSelected(event) {
    //
  }

  swapColors(event) {
    this.value = [...(this.value ?? [])].reverse()
    this.emitChange()
  }

  emitChange() {
    this._onChange(this.value?.length ? this.value : null)
  }

  clear() {
    this.value = null
    this.emitChange()
  }
}
