import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, forwardRef, input, model } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { SafePipe } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ITag } from '../../../@core'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, CdkListboxModule, CdkMenuModule, NgmI18nPipe, SafePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag-filter',
  templateUrl: './tag-filter.component.html',
  styleUrls: ['./tag-filter.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagFilterComponent),
      multi: true
    }
  ]
})
export class TagFilterComponent implements ControlValueAccessor {
  readonly allTags = input<ITag[]>()

  readonly tags = model<ITag[]>([])

  readonly top2Tags = computed(() => this.tags().slice(0, 2))
  readonly restTags = computed(() => this.tags().slice(2))

  private _onChange: (value: ITag[]) => void
  private _onTouched: (value: ITag[]) => void

  writeValue(obj: ITag[]): void {
    this.tags.set(obj)
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

  compareWith(a: ITag, b: ITag) {
    return a.id === b.id
  }

  onTagChange() {
    this._onChange?.(this.tags())
  }

  clear() {
    this.tags.set([])
    this.onTagChange()
  }
}
