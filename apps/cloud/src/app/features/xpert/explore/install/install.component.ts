import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { Router, RouterModule } from '@angular/router'
import { nonBlank } from '@metad/copilot'
import { parseYAML } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  convertToUrlPath,
  getErrorMessage,
  injectToastr,
  IXpertTemplate,
  TAvatar,
  TXpertTeamDraft,
  XpertService,
  XpertWorkspaceService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { debounceTime, filter, map, switchMap, tap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    MatInputModule,
    CdkMenuModule,
    CdkListboxModule,
    TextFieldModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    NgmSelectComponent
  ],
  selector: 'xpert-install',
  templateUrl: 'install.component.html',
  styleUrl: 'install.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertInstallComponent {
  readonly #data = inject<IXpertTemplate>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertService = inject(XpertService)
  readonly #translate = inject(TranslateService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()

  readonly workspaces = toSignal(this.workspaceService.getAllMy().pipe(map(({ items }) => items)))
  readonly workspaceOptions = computed(() => {
    return this.workspaces()?.map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  })

  readonly originName = this.#data.name

  // Models
  readonly workspace = model<string>()
  readonly name = model<string>(this.#data.name)
  readonly description = model<string>(this.#data.description)
  readonly avatar = model<TAvatar>(this.#data.avatar)

  readonly invalid = computed(() => !this.workspace() || this.checking() || this.error())
  readonly checking = signal(false)
  readonly error = signal<string>('')

  readonly loading = signal(false)

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

  close() {
    this.#dialogRef.close()
  }

  async create() {
    const xpert = {
      workspaceId: this.workspace(),
      name: this.name(),
      description: this.description(),
      avatar: this.avatar()
    }

    this.loading.set(true)
    const draft = await parseYAML<TXpertTeamDraft>(this.#data.export_data)
    this.xpertService
      .importDSL({
        ...draft,
        team: {
          ...draft.team,
          workspaceId: this.workspace(),
          name: this.name(),
          description: this.description(),
          avatar: this.avatar()
        }
      })
      .subscribe({
        next: (xpert) => {
          this.close()
          this.#router.navigate(['/xpert/', xpert.id])
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
