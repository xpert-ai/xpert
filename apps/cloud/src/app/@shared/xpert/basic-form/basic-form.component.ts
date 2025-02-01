import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { nonBlank } from '@metad/copilot'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { convertToUrlPath, injectToastr, TAvatar, XpertService } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { debounceTime, filter, switchMap, tap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatInputModule,
    CdkMenuModule,
    CdkListboxModule,
    TextFieldModule,
    EmojiAvatarComponent
  ],
  selector: 'xpert-basic-form',
  templateUrl: 'basic-form.component.html',
  styleUrl: 'basic-form.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertBasicFormComponent {
  readonly xpertService = inject(XpertService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()

  // Models
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()

  readonly invalid = computed(() => this.checking() || this.error())
  readonly checking = signal(false)
  readonly error = signal<string>('')

  private nameSub = toObservable(this.name)
    .pipe(
      tap((name) => {
        this.error.set(null)
        this.checking.set(true)
        const slug = convertToUrlPath(name || '')
        if (slug.length < 5) {
          this.error.set(this.#translate.instant('PAC.Xpert.TooShort', { Default: 'Too short' }))
          return null
        }

        if (/[^a-zA-Z0-9-\s]/.test(name)) {
          this.error.set(
            this.#translate.instant('PAC.Xpert.NameContainsNonAlpha', {
              Default: 'Name contains non (alphabetic | - | blank) characters'
            })
          )
          return null
        }
      }),
      filter(nonBlank),
      debounceTime(500),
      switchMap((name) => this.xpertService.validateName(name))
    )
    .subscribe((valid) => {
      if (!valid) {
        this.error.set(this.#translate.instant('PAC.Xpert.NameNotAvailable', { Default: 'Name not available' }))
      }
      this.checking.set(false)
    })
}
