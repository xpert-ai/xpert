import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { getErrorMessage, TagCategoryEnum, TagService, ToastrService } from '../../../@core'
import { MaterialModule } from '../../material.module'

import { ZardDialogRef } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    CdkListboxModule,
    NgxFloatUiModule,
    ButtonGroupDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag-creator',
  templateUrl: './creator.component.html',
  styleUrls: ['./creator.component.scss']
})
export class TagCreatorComponent {
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  eNgxFloatUiPlacements = NgxFloatUiPlacements

  readonly tagService = inject(TagService)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(ZardDialogRef)
  readonly #fb = inject(FormBuilder)

  readonly formGroup = this.#fb.group({
    name: this.#fb.control(null, [Validators.required]),
    category: this.#fb.control(null),
    color: this.#fb.control(null),
    description: this.#fb.control(null)
  })

  readonly allCategories = Object.values(TagCategoryEnum)

  apply() {
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
