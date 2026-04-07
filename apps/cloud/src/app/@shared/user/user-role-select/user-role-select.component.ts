import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardLoaderComponent,
  ZardTagSelectComponent
} from '@xpert-ai/headless-ui'
import { UsersService } from '@metad/cloud/state'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounce, distinctUntilChanged, map, of, startWith, switchMap, tap, timer } from 'rxjs'
import { IUser } from '../../../@core'
import { userLabel } from '../../pipes'

function isUser(value: unknown): value is IUser {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    ('email' in value || 'username' in value || 'fullName' in value || 'firstName' in value || 'lastName' in value)
  )
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardTagSelectComponent,
    ...ZardFormImports,
    ZardLoaderComponent,
    TranslateModule,
    ButtonGroupDirective
  ],
  selector: 'pac-user-role-select',
  templateUrl: 'user-role-select.component.html',
  styleUrls: ['user-role-select.component.scss']
})
export class UserRoleSelectComponent {
  private userService = inject(UsersService)
  public data: {
    role?: string
    roles?: ISelectOption[]
    single?: boolean
    emptyHint?: string
    searchOptions?: {
      organizationId?: string
      membership?: string
    }
  } = inject(DIALOG_DATA)
  private _dialogRef = inject(DialogRef)

  @Input() single: boolean

  role: string = null
  users: IUser[] = []
  loading = false
  searchControl = new FormControl<string>('')
  readonly loadOnEmptySearch = this.data?.searchOptions?.membership === 'non-members'

  public readonly users$ = this.searchControl.valueChanges.pipe(
    startWith(this.searchControl.value ?? ''),
    map((value) => (typeof value === 'string' ? value : '')),
    distinctUntilChanged(),
    debounce((text) => timer(!text.trim() && this.loadOnEmptySearch ? 0 : 500)),
    switchMap((text) => {
      if (text.trim() || this.loadOnEmptySearch) {
        this.loading = true
        return this.userService.search(text, this.data?.searchOptions).pipe(
          catchError((err) => {
            this.loading = false
            return of([])
          })
        )
      }
      return of([])
    }),
    tap((items) => (this.loading = false))
  )
  public readonly userOptions$ = this.users$.pipe(
    map((items) =>
      items.map((user) => ({
        id: user.id,
        label: userLabel(user),
        value: user,
        data: user
      }))
    )
  )

  constructor() {
    this.role = this.data?.role
    this.single = this.data?.single
  }

  readonly displayUser = (value: unknown) => {
    if (!isUser(value)) {
      return ''
    }

    return userLabel(value)
  }

  onSearchTermChange(value: string) {
    this.searchControl.setValue(value)
  }

  onUsersChange(value: unknown[]) {
    const nextUsers = Array.isArray(value) ? value.filter(isUser) : []
    this.users = this.single && nextUsers.length > 1 ? [nextUsers[nextUsers.length - 1]] : nextUsers
  }

  onPaste(event: ClipboardEvent) {
    // todo
    // // 获取粘贴的文本内容
    // const pastedText = event.clipboardData.getData('text');

    // const pastedLines = pastedText.split('\n');
    // pastedLines.forEach(line => {
    //   // 查找与每行粘贴内容匹配的选项（忽略大小写）
    //   const matchingOption = this.options.find(option => 
    //     option.toLowerCase() === line.toLowerCase().trim()
    //   );

    //   if (matchingOption) {
    //     // 如果找到匹配项，插入选项
    //     this.insertOption(matchingOption);
    //   } else {
    //     // 如果没有匹配项，可以选择不处理或提示用户
    //     console.log('未找到匹配的选项:', line);
    //   }
    // });

    // // 阻止默认粘贴行为（可选）
    // event.preventDefault();
  }

  onApply() {
    this._dialogRef.close({
      role: this.role,
      users: this.users
    })
  }

  onCancel() {
    this._dialogRef.close()
  }

  readonly compareUsers = (a: unknown, b: unknown) => isUser(a) && isUser(b) && a.id === b.id
}
