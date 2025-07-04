import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, forwardRef, inject, input, model } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatestWith, debounceTime, map, startWith, switchMap } from 'rxjs'
import { ITag, TagCategoryEnum, TagService } from '../../../@core'
import { TagComponent } from '../tag/tag.component'
import { NgmI18nPipe } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CdkListboxModule,
    NgxFloatUiModule,
    FormsModule,
    ReactiveFormsModule,
    NgmHighlightDirective,
    NgmI18nPipe,
    TagComponent,
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

  readonly category = input<TagCategoryEnum>()
  readonly optional = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly tags = derivedAsync(() => {
    return this.tagService.getAllByCategory(this.category())
  })

  readonly selectedTags = model<ITag[]>([])

  readonly searchControl = new FormControl('')
  readonly tags$ = toSignal(
    toObservable(this.category).pipe(
      switchMap((category) => this.tagService.getAllByCategory(category)),
      combineLatestWith(this.searchControl.valueChanges.pipe(startWith(''), debounceTime(300))),
      map(([tags, text]) => {
        return text ? tags.filter((_) => _.name.toLowerCase().includes(text.toLowerCase())) : tags
      })
    )
  )

  private _onChange: (value: ITag[]) => void
  private _onTouched: (value: ITag[]) => void

  selectTags(event: ListboxValueChangeEvent<ITag>) {
    this.selectedTags.set([...event.value])
    this._onChange?.(this.selectedTags())
  }

  writeValue(obj: ITag[]): void {
    this.selectedTags.set(obj)
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    //
  }

  listboxCompareWith(tag1: ITag, tag2: ITag) {
    return tag1.id === tag2.id
  }

  checkedWith(value: ITag) {
    return this.selectedTags()?.some((_) => this.listboxCompareWith(_, value))
  }
}
