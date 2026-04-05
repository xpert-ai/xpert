
import { animate, query, stagger, style, transition, trigger } from '@angular/animations'
import { ChangeDetectionStrategy, Component, Input, computed, forwardRef, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedOptionTemplateDirective,
  ZardFormImports,
  ZardIconComponent,
  type ZardComboboxDeprecatedGroup,
  type ZardComboboxDeprecatedOption
} from '@xpert-ai/headless-ui'
import { DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

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
    ZardComboboxDeprecatedComponent,
    ZardComboboxDeprecatedOptionTemplateDirective,
    ...ZardFormImports,
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
  @Input() label: string
  @Input() placeholder: string
  @Input() options: { label: string; colors: Array<{colors: string[]; keywords?: string[]}> }[]

  @Input() disabled = false

  value: string[] | null = null
  readonly searchTerm = signal('')
  readonly colorGroups = computed<ZardComboboxDeprecatedGroup<string[]>[]>(() =>
    (this.options ?? []).map((group) => ({
      label: group.label,
      options: group.colors.map((color) => ({
        id: color.colors.join(','),
        label: color.colors.join(', '),
        value: color.colors,
        keywords: [...(color.keywords ?? []), ...color.colors],
        data: color
      }))
    }))
  )

  private _onChange: (value) => void = () => {}
  private _onTouched: () => void = () => {}

  writeValue(obj: any): void {
    this.value = obj
    this.searchTerm.set('')
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

  displayColors(_option: ZardComboboxDeprecatedOption | null, value: unknown) {
    return Array.isArray(value) ? value.join(', ') : `${value ?? ''}`
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
  }

  onTouched() {
    this._onTouched()
  }

  onComboboxValueChange(value: unknown) {
    if (Array.isArray(value)) {
      this.value = value
    } else {
      this.value = this.parseColors(value)
    }
    this.emitChange()
  }

  swapColors(event: Event) {
    this.value = [...(this.value ?? [])].reverse()
    this.emitChange()
  }

  emitChange() {
    this._onChange(this.value?.length ? this.value : null)
  }

  clear() {
    this.value = null
    this.searchTerm.set('')
    this.emitChange()
  }

  private parseColors(value: unknown): string[] | null {
    if (typeof value !== 'string') {
      return null
    }

    return value.split(',').reduce<string[]>((acc, cur) => {
      cur.split(' ').forEach((color) => {
        if (color.trim()) {
          acc.push(color.trim())
        }
      })
      return acc
    }, [])
  }
}
