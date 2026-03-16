import { COMMA, ENTER } from '@angular/cdk/keycodes'
import { CommonModule } from '@angular/common'
import {
  Component,
  ElementRef,
  Input,
  ViewChild,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { isString } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardChipInputEvent } from '@xpert-ai/headless-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { startWith } from 'rxjs'
import { ITag, Store, TagCategoryEnum, TagService } from '../../../@core'
import { MaterialModule } from '../../material.module'
import { NgmFieldColor } from "@metad/ocap-angular/core";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, TranslateModule, NgmHighlightDirective],
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
  // @Input() category: string
  readonly category = input<TagCategoryEnum>(null)

  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>

  tagCtrl = new FormControl('')

  private onChange: (value: any) => void
  private onTouched: () => void

  addOnBlur = false
  readonly separatorKeysCodes = [ENTER, COMMA] as const
  tags = signal<ITag[]>(null)

  get highlight() {
    return this.tagCtrl.value
  }

  readonly _tags = derivedAsync(() => this.tagService.getAllByCategory(this.category()), { initialValue: []})

  readonly search = toSignal(this.tagCtrl.valueChanges.pipe(startWith(null)))

  readonly filterdTags = computed(() => {
    const tags = this._tags()
    const search = this.search()
    if (isString(search)) {
      const _tag = search?.trim().toLowerCase()
      return search
        ? tags.filter(
            (item) => item.name.toLowerCase().includes(_tag) || item.description?.toLowerCase().includes(_tag)
          )
        : tags.slice()
    }
    return tags
  })

  constructor() {
    effect(
      () => {
        this.tags.update((values) => values.map((value) => this._tags().find((item) => item.id === value.id) ?? value))
      },
      { allowSignalWrites: true }
    )
  }

  writeValue(obj: any): void {
    this.tags.set(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
    isDisabled ? this.tagCtrl.disable({ emitEvent: false }) : this.tagCtrl.enable({ emitEvent: false })
  }

  add(event: ZardChipInputEvent): void {
    const value = (event.value || '').trim()

    // Add our tag
    if (value) {
      this.tags.set([
        ...(this.tags() ?? []),
        {
          name: value,
          color: 'blue',
          category: this.category(),
          organizationId: this.store.selectedOrganization.id
        }
      ])
      this.onChange(this.tags())
    }

    // Clear the input value
    event.chipInput!.clear()
  }

  remove(tag: ITag): void {
    const index = this.tags()?.indexOf(tag)

    if (index >= 0) {
      this.tags().splice(index, 1)
      this.onChange(this.tags())
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.tags.set([...(this.tags() ?? []), event.option.value])
    this.tagInput.nativeElement.value = ''
    this.tagCtrl.setValue(null)
    this.onChange(this.tags())
  }
}
