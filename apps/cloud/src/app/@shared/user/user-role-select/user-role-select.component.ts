import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  ZardFormImports,
  ZardIconComponent,
  ZardLoaderComponent,
  ZardChipsImports,
  type ZardComboboxOption
} from '@xpert-ai/headless-ui'
import { UsersService } from '@metad/cloud/state'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounce, distinctUntilChanged, map, of, startWith, switchMap, tap, timer } from 'rxjs'
import { IUser } from '../../../@core'
import { userLabel, UserPipe } from '../../pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ...ZardFormImports,
    ...ZardChipsImports,
    ZardIconComponent,
    ZardLoaderComponent,
    TranslateModule,
    ButtonGroupDirective,
    NgmCommonModule,
    UserPipe
  ],
  selector: 'pac-user-role-select',
  templateUrl: 'user-role-select.component.html',
  styleUrls: ['user-role-select.component.scss']
})
export class UserRoleSelectComponent {
  private skipNextSearchTermSync = false
  userLabel = userLabel

  private userService = inject(UsersService)
  public data: {
    role?: string
    roles?: ISelectOption[]
    single?: boolean
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

  displayWith(_option: ZardComboboxOption | null, value: unknown) {
    if (value === null) {
      return ''
    }

    const user = value as IUser
    return user.fullName || user.firstName || user.email
  }

  remove(user: IUser): void {
    const index = this.users.indexOf(user)

    if (index >= 0) {
      this.users.splice(index, 1)
    }
  }

  onSearchTermChange(value: string) {
    if (this.skipNextSearchTermSync) {
      this.skipNextSearchTermSync = false
      this.searchControl.setValue('', { emitEvent: false })
      return
    }

    this.searchControl.setValue(value)
  }

  selected(value: unknown): void {
    const user = value as IUser | null
    if (user && !this.users.find((item) => item.id === user.id)) {
      if (this.single) {
        this.users = [user]
      } else {
        this.users.push(user)
      }
    }
    this.resetSearch()
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

  private resetSearch() {
    this.skipNextSearchTermSync = true
    this.searchControl.setValue('', { emitEvent: false })
  }
}
