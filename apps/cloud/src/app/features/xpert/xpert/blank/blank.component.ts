import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, map, of, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IXpertRole,
  IXpertWorkspace,
  TAvatar,
  ToastrService,
  uuid,
  XpertService,
  XpertTypeEnum
} from '../../../../@core'
import { MaterialModule } from '../../../../@shared/material.module'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'

@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ButtonGroupDirective,
    MaterialModule,
    FormsModule,
    CdkListboxModule,
    EmojiAvatarComponent
  ],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss'
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  readonly #dialogRef = inject(MatDialogRef<XpertNewBlankComponent>)
  readonly #dialogData = inject<{ workspace: IXpertWorkspace }>(MAT_DIALOG_DATA)
  readonly xpertService = inject(XpertService)
  readonly #toastr = inject(ToastrService)

  readonly types = model<XpertTypeEnum[]>([XpertTypeEnum.Agent])
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()

  readonly checking = signal(false)
  readonly validateName = toSignal<{available: boolean; error?: string;}>(
    toObservable(this.name).pipe(
      debounceTime(500),
      switchMap((title) => {
        if (title) {
          const isValidTitle = /^[a-zA-Z0-9 _-]+$/.test(title)
          if (!isValidTitle) {
            return of({
              available: false,
              error: 'Name can only contain [a-zA-Z0-9 _-]'
            })
          }

          return this.validateTitle(title).pipe(
            map((items) => ({
              available: !items.length,
              error: items.length ? 'Name existed!' : ''
            }))
          )
        }

        return of({
          available: true
        })
      })
    )
  )

  validateTitle(title: string) {
    this.checking.set(true)
    return this.xpertService.validateTitle(title).pipe(tap(() => this.checking.set(false)))
  }

  create() {
    this.xpertService
      .create({
        type: this.types()[0],
        name: this.name(),
        description: this.description(),
        latest: true,
        workspaceId: this.#dialogData?.workspace?.id,
        avatar: this.avatar(),
        agent: {
          key: uuid(),
          avatar: this.avatar()
        }
      })
      .subscribe({
        next: (xpert) => {
          this.#toastr.success(`PAC.Messages.CreatedSuccessfully`, { Default: 'Created Successfully' })
          this.close(xpert)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  close(value?: IXpertRole) {
    this.#dialogRef.close(value)
  }
}
