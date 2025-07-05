import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatInputModule } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { getErrorMessage, ITag, TagCategoryEnum, TagService, ToastrService } from '../../../@core'
import { TagCreatorComponent } from '../creator/creator.component'
import { TagComponent } from '../tag/tag.component'


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkListboxModule, MatInputModule, TagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag-maintain',
  templateUrl: './maintain.component.html',
  styleUrls: ['./maintain.component.scss']
})
export class TagMaintainComponent {
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  eNgxFloatUiPlacements = NgxFloatUiPlacements

  readonly tagService = inject(TagService)
  readonly #dialog = inject(MatDialog)
  readonly #toastr = inject(ToastrService)

  readonly tenant = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly allCategories = toSignal(this.tagService.getAllCategories())

  readonly categories = model<TagCategoryEnum[]>([])
  readonly category = computed(() => this.categories()[0])

  readonly #tags = derivedAsync(() => {
    return this.tagService.getAllByCategory(this.category())
  })

  readonly tags = computed(() => structuredClone(this.#tags()))

  setCategories(event: ListboxValueChangeEvent<TagCategoryEnum>) {
    this.categories.set([...event.value])
  }

  createTag() {
    const dialogRef = this.#dialog.open(TagCreatorComponent, {
      data: { category: this.category() }
    })

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.tagService.refresh()
      }
    })
  }

  deleteTag(tag: ITag) {
    this.tagService.delete(tag.id).subscribe({
      next: () => {
        this.tagService.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  updateTag(tag: ITag, attrName: string) {
    if (tag[attrName] !== this.#tags().find((_) => _.id === tag.id)?.[attrName]) {
      this.tagService.update(tag.id, { [attrName]: tag[attrName] }).subscribe({
        next: () => {
          this.tagService.refresh()
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  onLabel(tag: ITag) {
    this.updateTag(tag, 'label')
  }

  onDescripton(tag: ITag) {
    this.updateTag(tag, 'desciption')
  }

  onColor(tag: ITag) {
    this.updateTag(tag, 'color')
  }

  onIcon(tag: ITag) {
    this.updateTag(tag, 'icon')
  }
}
