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
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardTagSelectComponent,
  type ZardTagSelectOption
} from '@xpert-ai/headless-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { ITag, Store, TagCategoryEnum, TagService } from '../../../@core'
import { SharedUiModule } from '../../ui.module'
import { NgmFieldColor } from '@metad/ocap-angular/core'

function isTag(value: unknown): value is ITag {
  return !!value && typeof value === 'object' && ('id' in value || 'name' in value || 'category' in value)
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    SharedUiModule,
    TranslateModule,
    ZardTagSelectComponent
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

  disabled = false
  @Input() color: NgmFieldColor
  readonly category = input<TagCategoryEnum>(null)
  readonly tags = signal<ITag[]>([])

  private onChange: (value: ITag[]) => void = () => {}
  private onTouched: () => void = () => {}

  readonly _tags = derivedAsync(() => this.tagService.getAllByCategory(this.category()), { initialValue: [] })
  readonly selectOptions = computed<ZardTagSelectOption<ITag>[]>(() =>
    this._tags().map((tag) => ({
      label: tag.name,
      value: tag,
      keywords: tag.description ? [tag.description] : [],
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
      }
    )
  }

  writeValue(obj: any): void {
    this.tags.set(Array.isArray(obj) ? obj : [])
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

  onBlur() {
    this.onTouched()
  }

  onValueChange(value: unknown[]) {
    this.tags.set(Array.isArray(value) ? value.filter(isTag) : [])
    this.onChange(this.tags())
  }

  readonly compareTags = (a: unknown, b: unknown) => {
    if (!isTag(a) || !isTag(b)) {
      return false
    }

    if (a.id && b.id) {
      return a.id === b.id
    }

    return (a.name ?? '').trim().toLowerCase() === (b.name ?? '').trim().toLowerCase()
  }

  readonly createTagFromInput = (value: string): ITag | null => {
    const name = value.trim()
    if (!name) {
      return null
    }

    return {
      name,
      color: 'blue',
      category: this.category(),
      organizationId: this.store.organizationId
    }
  }

  readonly displayTag = (value: unknown) => (isTag(value) ? value.name ?? '' : '')
}
