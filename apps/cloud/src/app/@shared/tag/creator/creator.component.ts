import { XpDialogFrameImports, ZardInputDirective, ZardButtonComponent, ZardSelectImports } from '@xpert-ai/headless-ui'

import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, TagCategoryEnum, TagService, ToastrService } from '../../../@core'

import { DialogRef } from '@angular/cdk/dialog'
@Component({
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    ZardInputDirective,
    ZardButtonComponent,
    ...ZardSelectImports,
    ReactiveFormsModule,
    TranslateModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag-creator',
  templateUrl: './creator.component.html'
})
export class TagCreatorComponent {
  readonly tagService = inject(TagService)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)
  readonly #fb = inject(FormBuilder)

  readonly formGroup = this.#fb.group({
    name: this.#fb.control(null, [Validators.required]),
    category: this.#fb.control(null),
    color: this.#fb.control(null),
    description: this.#fb.control(null)
  })

  readonly allCategories = Object.values(TagCategoryEnum)

  close() {
    this.#dialogRef.close()
  }

  apply() {
    if (this.formGroup.invalid || this.formGroup.pristine) return
    this.tagService.create(this.formGroup.value).subscribe({
      next: (tag) => {
        this.#dialogRef.close(tag)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
