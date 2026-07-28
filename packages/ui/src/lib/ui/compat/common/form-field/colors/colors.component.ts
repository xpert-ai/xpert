import { animate, query, stagger, style, transition, trigger } from '@angular/animations'
import { ChangeDetectionStrategy, Component, Input, computed, forwardRef, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedGroup,
  ZardComboboxDeprecatedOption,
  ZardComboboxDeprecatedOptionTemplateDirective,
  ZardFormImports,
  ZardIconComponent
} from '../../../../../components'
import { DensityDirective } from '../../../core'

const colorsEnterAnimation = trigger('colorsEnterAnimation', [
  transition('* <=> *', [
    query(':enter', [style({ opacity: 0 }), stagger('20ms', animate('100ms ease-out', style({ opacity: 1 })))], {
      optional: true
    })
  ])
])

export interface ColorPaletteGroup {
  label: string
  colors: Array<{ colors: string[]; keywords?: string[] }>
}

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
  styleUrl: './colors.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmColorsComponent)
    }
  ],
  animations: [colorsEnterAnimation]
})
export class NgmColorsComponent implements ControlValueAccessor {
  @Input() label = ''
  @Input() placeholder = ''
  @Input() options: ColorPaletteGroup[] = []
  @Input() disabled = false

  value: string[] | null = null
  readonly searchTerm = signal('')
  readonly colorGroups = computed<ZardComboboxDeprecatedGroup<string[]>[]>(() =>
    this.options.map((group) => ({
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

  private onChange: (value: string[] | null) => void = () => undefined
  private onTouchedCallback: () => void = () => undefined

  writeValue(value: string[] | null): void {
    this.value = value
    this.searchTerm.set('')
  }

  registerOnChange(callback: (value: string[] | null) => void): void {
    this.onChange = callback
  }

  registerOnTouched(callback: () => void): void {
    this.onTouchedCallback = callback
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  displayColors(_option: ZardComboboxDeprecatedOption | null, value: unknown) {
    return Array.isArray(value) ? value.join(', ') : `${value ?? ''}`
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
  }

  onTouched() {
    this.onTouchedCallback()
  }

  onComboboxValueChange(value: unknown) {
    this.value = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : this.parseColors(value)
    this.emitChange()
  }

  swapColors() {
    this.value = [...(this.value ?? [])].reverse()
    this.emitChange()
  }

  clear() {
    this.value = null
    this.searchTerm.set('')
    this.emitChange()
  }

  private emitChange() {
    this.onChange(this.value?.length ? this.value : null)
  }

  private parseColors(value: unknown): string[] | null {
    if (typeof value !== 'string') return null
    return value
      .split(/[\s,]+/)
      .map((color) => color.trim())
      .filter(Boolean)
  }
}
