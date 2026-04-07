import { CommonModule } from '@angular/common'
import { Component, Inject } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardLoaderComponent,
  ZardTagSelectComponent,
  Z_MODAL_DATA,
  ZardDialogRef
} from '@xpert-ai/headless-ui'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounceTime, EMPTY, filter, map, of, switchMap, tap } from 'rxjs'
import { EmployeesService, IEmployee } from '../../../@core'
import { userLabel } from '../../pipes'
import { SharedModule } from '../../shared.module'

function isEmployee(value: unknown): value is IEmployee {
  return !!value && typeof value === 'object' && 'user' in value && 'userId' in value && 'isActive' in value && 'tags' in value
}

@Component({
  standalone: true,
  imports: [
    SharedModule,
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
  selector: 'pac-employee-search',
  templateUrl: 'employee-search.component.html',
  styleUrls: ['employee-search.component.scss']
})
export class EmployeeSelectComponent {
  role = null
  users: IEmployee[] = []
  loading = false
  searchControl = new FormControl<string>('')

  public readonly users$ = this.searchControl.valueChanges.pipe(
    debounceTime(500),
    filter((value) => typeof value === 'string'),
    switchMap((text) => {
      if (text.trim()) {
        this.loading = true
        return this.employeeService.search(text).pipe(
          catchError((err) => {
            this.loading = false
            return EMPTY
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
        label: userLabel(user.user),
        value: user,
        data: user
      }))
    )
  )

  constructor(
    @Inject(Z_MODAL_DATA)
    public data: { role: string; roles: ISelectOption[] },
    private _dialogRef: ZardDialogRef<EmployeeSelectComponent>,
    private employeeService: EmployeesService
  ) {
    this.role = data?.role
  }

  onSearchTermChange(value: string) {
    this.searchControl.setValue(value)
  }

  onUsersChange(value: unknown[]) {
    this.users = Array.isArray(value) ? value.filter(isEmployee) : []
  }

  readonly displayUser = (value: unknown) => {
    if (!isEmployee(value)) {
      return ''
    }

    return userLabel(value.user)
  }

  onApply() {
    this._dialogRef.close({
      role: this.role,
      employees: this.users
    })
  }

  readonly compareUsers = (a: unknown, b: unknown) => isEmployee(a) && isEmployee(b) && a.id === b.id
}
