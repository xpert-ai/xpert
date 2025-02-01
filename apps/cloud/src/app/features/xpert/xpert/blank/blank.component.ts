import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IXpert,
  IXpertWorkspace,
  TAvatar,
  ToastrService,
  XpertService,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { DragDropModule } from '@angular/cdk/drag-drop'

@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    MatInputModule,
    MatButtonModule,
    ButtonGroupDirective,
    FormsModule,
    CdkListboxModule,
    XpertBasicFormComponent
  ],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss'
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  readonly #dialogRef = inject(DialogRef<IXpert>)
  readonly #dialogData = inject<{ workspace: IXpertWorkspace }>(DIALOG_DATA)
  readonly xpertService = inject(XpertService)
  readonly #toastr = inject(ToastrService)

  readonly types = model<XpertTypeEnum[]>([XpertTypeEnum.Agent])
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()

  // readonly checking = signal(false)
  // readonly validateName = toSignal<{available: boolean; error?: string;}>(
  //   toObservable(this.name).pipe(
  //     debounceTime(500),
  //     switchMap((title) => {
  //       if (title) {
  //         const isValidTitle = /^[a-zA-Z0-9 _-]+$/.test(title)
  //         if (!isValidTitle) {
  //           return of({
  //             available: false,
  //             error: this.#translate.instant('PAC.Xpert.NameOnlyContain', {Default: 'Name can only contain [a-zA-Z0-9 _-]'})
  //           })
  //         }

  //         return this._validateName(title).pipe(
  //           map((available) => ({
  //             available,
  //             error: available ? '' : this.#translate.instant('PAC.Xpert.NameExisted', {Default: 'Name existed!'})
  //           }))
  //         )
  //       }

  //       return of({
  //         available: true,
  //         error: null
  //       })
  //     })
  //   )
  // )

  // _validateName(name: string) {
  //   this.checking.set(true)
  //   return this.xpertService.validateName(name).pipe(tap(() => this.checking.set(false)))
  // }

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
          key: genAgentKey(),
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

  close(value?: IXpert) {
    this.#dialogRef.close(value)
  }
}
