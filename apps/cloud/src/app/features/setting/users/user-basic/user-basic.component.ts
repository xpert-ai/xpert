import { Component, effect, inject, input, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'

import { UsersService } from '@xpert-ai/cloud/state'
import { IUserUpdateInput, IXpertPrincipalReference, LanguagesEnum } from '@xpert-ai/contracts'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CreatedByPipe } from 'apps/cloud/src/app/@shared/pipes'
import { ToastrService, User, XpertAPIService } from '../../../../@core'
import { BasicInfoFormComponent, UserFormsModule } from '../../../../@shared/user/forms'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { combineLatest, of } from 'rxjs'
import { catchError, startWith, switchMap } from 'rxjs/operators'

@Component({
  standalone: true,
  selector: 'pac-user-basic',
  templateUrl: 'user-basic.component.html',
  styles: [
    `
      :host {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }
    `
  ],
  imports: [FormsModule, TranslateModule, ZardButtonComponent, NgmCommonModule, UserFormsModule]
})
export class UserBasicComponent {
  private readonly userComponent = inject(PACEditUserComponent)
  private readonly userService = inject(UsersService)
  private readonly xpertService = inject(XpertAPIService)
  private readonly toastrService = inject(ToastrService)

  // Inputs
  readonly allowRoleChange = input<boolean>()
  readonly readOnly = input<boolean>(false)
  readonly showLinkedXpert = input<boolean>(false)

  // Children
  readonly userBasicInfo = viewChild(BasicInfoFormComponent)
  readonly linkedXpert = toSignal<IXpertPrincipalReference | null | undefined>(
    combineLatest([toObservable(this.showLinkedXpert), this.userComponent.userId$]).pipe(
      switchMap(([showLinkedXpert, userId]) =>
        showLinkedXpert && userId
          ? this.xpertService.getByPrincipalUser(userId).pipe(
              startWith(undefined),
              catchError(() => of(null))
            )
          : of(null)
      )
    ),
    { initialValue: undefined }
  )

  user: User

  constructor() {
    effect(() => {
      this.user = this.userComponent.user() as User
    })
  }

  async save() {
    if (this.readOnly()) {
      return
    }

    const { email, username, firstName, lastName, tags, preferredLanguage, imageUrl, roleId, thirdPartyId, timeZone } =
      this.user
    let request: IUserUpdateInput = {
      email,
      username,
      firstName,
      lastName,
      tags,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      imageUrl,
      thirdPartyId,
      timeZone
    }

    // if (password) {
    //   request = {
    //     ...request,
    //     hash: password
    //   }
    // }

    if (this.allowRoleChange()) {
      request = {
        ...request,
        roleId
      }
    }

    try {
      await this.userService.update(this.user.id, request)
      this.toastrService.success(`PAC.NOTES.USERS.USER_UPDATED`, { name: new CreatedByPipe().transform(this.user) })
      this.userBasicInfo().form.markAsPristine()
    } catch (error) {
      this.toastrService.danger(error)
    }
  }
}
