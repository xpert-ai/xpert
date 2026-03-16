import { CommonModule } from '@angular/common'
import {
  Component,
  Input,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  type ZardComboboxOption
} from '@xpert-ai/headless-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { ITag, Store, TagCategoryEnum, TagService } from '../../../@core'
import { MaterialModule } from '../../material.module'
import { NgmFieldColor } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    TranslateModule,
    NgmHighlightDirective,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective
  ],
  selector: 'pac-tag-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  inputs: ['disabled', 'color'],
  host: {
    '[attr.disabled]': 'disabled || null'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => TagEditorComponent)
    }
  ]
})
export class TagEditorComponent implements ControlValueAccessor {
  private tagService = inject(TagService)
  private store = inject(Store)
  private skipNextSearchTermSync = false

  disabled = false
  @Input() color: NgmFieldColor
  // @Input() category: string
  readonly category = input<TagCategoryEnum>(null)
  readonly searchTerm = signal('')
  readonly tags = signal<ITag[]>([])

  private onChange: (value: ITag[]) => void = () => {}
  private onTouched: () => void = () => {}

  get highlight() {
    return this.searchTerm()
  }

  readonly _tags = derivedAsync(() => this.tagService.getAllByCategory(this.category()), { initialValue: [] })
  readonly comboboxOptions = computed<ZardComboboxOption[]>(() =>
    this._tags().map((tag) => ({
      id: tag.id ?? tag.name,
      label: tag.name,
      value: tag,
      data: tag
    }))
  )

  constructor() {
    effect(
      () => {
        const allTags = this._tags()
        this.tags.update((values) =>
          (values ?? []).map((value) => allTags.find((item) => item.id === value.id) ?? value)
        )
      },
      { allowSignalWrites: true }
    )
  }

  writeValue(obj: any): void {
    this.tags.set(Array.isArray(obj) ? obj : [])
    this.searchTerm.set('')
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  displayTag(_option: ZardComboboxOption | null, value: unknown) {
    return (value as ITag | null)?.name ?? `${value ?? ''}`
  }

  filterTagOption(option: ZardComboboxOption, searchTerm: string) {
    const tag = option.data as ITag | undefined
    const normalized = searchTerm?.trim().toLowerCase()
    if (!normalized) {
      return true
    }

    return (
      tag?.name?.toLowerCase().includes(normalized) ||
      tag?.description?.toLowerCase().includes(normalized)
    )
  }

  remove(tag: ITag): void {
    this.tags.set(this.tags().filter((item) => item !== tag))
    this.onChange(this.tags())
  }

  onBlur() {
    this.onTouched()
  }

  onSearchTermChange(value: string) {
    if (this.skipNextSearchTermSync) {
      this.skipNextSearchTermSync = false
      this.searchTerm.set('')
      return
    }

    this.searchTerm.set(value)
  }

  selected(value: unknown): void {
    const tag = value as ITag | null
    if (tag && !this.tags().some((item) => item.id === tag.id)) {
      this.tags.set([...(this.tags() ?? []), tag])
      this.onChange(this.tags())
    }
    this.resetComboboxSearch()
  }

  submitCustomTag(value: string) {
    const name = value.trim()
    if (!name) {
      this.resetComboboxSearch()
      return
    }

    this.tags.set([
      ...(this.tags() ?? []),
      {
        name,
        color: 'blue',
        category: this.category(),
        organizationId: this.store.selectedOrganization.id
      }
    ])
    this.onChange(this.tags())
    this.resetComboboxSearch()
  }

  private resetComboboxSearch() {
    this.skipNextSearchTermSync = true
    this.searchTerm.set('')
  }
}
