import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import {
  XpHighlightDirective,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { debounceTime, switchMap } from 'rxjs'
import { ITag, TagTarget, TagService } from '../../../@core'
import { XpI18nPipe } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    NgxFloatUiModule,
    FormsModule,
    ReactiveFormsModule,
    XpHighlightDirective,
    XpI18nPipe,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag-select',
  templateUrl: './tag-select.component.html',
  styleUrls: ['./tag-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagSelectComponent),
      multi: true
    }
  ]
})
export class TagSelectComponent implements ControlValueAccessor {
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  eNgxFloatUiPlacements = NgxFloatUiPlacements

  readonly tagService = inject(TagService)

  readonly category = input<TagTarget>()
  readonly optional = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly selectedTags = model<ITag[]>([])
  readonly disabled = signal(false)
  readonly catalog = toSignal(
    toObservable(this.category).pipe(switchMap((category) => this.tagService.getCatalogByCategory(category))),
    { initialValue: [] }
  )
  readonly displayedTags = computed(() => {
    const current = new Map(this.catalog().map((tag) => [tag.id, tag]))
    return this.selectedTags().map((tag) => current.get(tag.id) ?? tag)
  })

  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300)), { initialValue: '' })
  readonly options = computed(() => {
    const query = this.search()?.trim().toLocaleLowerCase()
    return this.catalog().filter(
      (tag) => tag.isActive !== false && (!query || tag.name?.toLocaleLowerCase().includes(query))
    )
  })

  private _onChange: (value: ITag[]) => void
  private _onTouched: () => void

  selectTag(tag: ITag, checked: boolean) {
    if (checked === this.checkedWith(tag)) return
    if (checked && !this.options().some((option) => option.id === tag.id)) return
    // A candidate toggle must not replace selections hidden by status, search or catalog loading.
    this.changeSelection(
      checked ? [...this.selectedTags(), tag] : this.selectedTags().filter((selected) => selected.id !== tag.id)
    )
  }

  removeTag(tag: ITag, event: Event) {
    event.stopPropagation()
    this.changeSelection(this.selectedTags().filter((selected) => selected.id !== tag.id))
  }

  private changeSelection(tags: ITag[]) {
    if (this.disabled()) return
    this.selectedTags.set(tags)
    this._onChange?.(tags)
    this._onTouched?.()
  }

  writeValue(obj: ITag[]): void {
    this.selectedTags.set(obj ?? [])
  }
  registerOnChange(fn: (value: ITag[]) => void): void {
    this._onChange = fn
  }
  registerOnTouched(fn: () => void): void {
    this._onTouched = fn
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
    if (isDisabled) this.searchControl.disable({ emitEvent: false })
    else this.searchControl.enable({ emitEvent: false })
  }

  checkedWith(value: ITag) {
    return this.selectedTags().some((tag) => tag.id === value.id)
  }
}
