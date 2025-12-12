import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import {
  AiModelTypeEnum,
  convertToUrlPath,
  getErrorMessage,
  ICopilotModel,
  injectToastr,
  TAvatar,
  XpertAPIService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { nonBlank } from '@metad/copilot'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { debounceTime, filter, switchMap } from 'rxjs/operators'
import { BehaviorSubject } from 'rxjs'
import { CopilotModelSelectComponent } from '../../copilot'

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
    EmojiAvatarComponent,
    CopilotModelSelectComponent
  ],
  selector: 'xpert-basic-form',
  templateUrl: 'basic-form.component.html',
  styleUrl: 'basic-form.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertBasicFormComponent {
  eAiModelTypeEnum = AiModelTypeEnum
  readonly xpertService = inject(XpertAPIService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()

  // Models
  readonly avatar = model<TAvatar>()
  readonly name = model<string>()
  readonly title = model<string>()
  readonly description = model<string>()
  readonly copilotModel = model<ICopilotModel>()

  readonly invalid = computed(() => this.checking() || this.error() || !this.copilotModel()?.copilotId)
  readonly checking = signal(false)
  readonly error = signal<string>('')

  readonly name$ = new BehaviorSubject<string>(null)

  private nameSub = this.name$
    .pipe(
      filter(nonBlank),
      debounceTime(500),
      switchMap((name) => {
        this.checking.set(true)
        return this.xpertService.validateName(name)
      })
    )
    .subscribe({
      next: (valid) => {
        this.checking.set(false)
        if (!valid) {
          this.error.set(this.#translate.instant('PAC.Xpert.IDNotAvailable', { Default: 'ID not available' }))
        }
      },
      error: (err) => {
        this.checking.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  
  constructor() {
    effect(() => {
      const name = this.name()
      this.checking.set(true)
      this.error.set(null)

      // Only validate if name is not blank
      if (!name || name.trim().length === 0) {
        this.checking.set(false)
        return
      }

      if (/[^a-zA-Z0-9-\s]/.test(name)) {
        this.error.set(
          this.#translate.instant('PAC.Xpert.NameContainsNonAlpha', {
            Default: 'Name contains non (alphabetic | - | blank) characters'
          })
        )
        return
      }

      const slug = convertToUrlPath(name || '')
      if (slug.length < 5) {
        this.error.set(this.#translate.instant('PAC.Xpert.TooShort', { Default: 'Too short' }))
        return
      }

      this.name$.next(name)
    }, { allowSignalWrites: true })
  }
}
