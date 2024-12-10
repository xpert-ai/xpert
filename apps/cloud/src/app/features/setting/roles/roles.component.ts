import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { MatSnackBar } from '@angular/material/snack-bar'
import { isNil } from '@metad/ocap-core'
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs'
import { debounceTime, filter, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { environment } from '../../../../environments/environment'
import {
  IRole,
  IRolePermission,
  IUser,
  PermissionGroups,
  PermissionsEnum,
  RolePermissionsService,
  RolesEnum,
  RoleService,
  Store,
  ToastrService
} from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgmConfirmDeleteComponent, NgmConfirmUniqueComponent } from '@metad/ocap-angular/common'

@Component({
  selector: 'pac-roles',
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent extends TranslationBaseComponent implements OnInit {
  readonly destroyRef = inject(DestroyRef)
  
  permissionGroups = PermissionGroups

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly roles$ = this.refresh$.pipe(switchMap(() => this.rolesService.getAll()),
    map(({ items }) => items),
    shareReplay(1)
  )
  public readonly totals$ = this.roles$.pipe(map((roles) => roles?.length || 0))
  permissionTotals = PermissionGroups?.ADMINISTRATION.length + PermissionGroups?.GENERAL.length
  enablePermissionTotals = 0

  user: IUser
  role: IRole
  roles: IRole[] = []
  permissions: IRolePermission[] = []
  // selectedRole: RolesEnum[] = [RolesEnum.EMPLOYEE]

  loading: boolean
  enabledPermissions: any = {}
  permissions$: Subject<void> = new Subject()

  constructor(
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly rolesService: RoleService,
    private readonly store: Store,
    private _cdr: ChangeDetectorRef,
    private readonly _snackBar: MatSnackBar,
    private readonly _dialog: MatDialog,
    private readonly _toastr: ToastrService
  ) {
    super()
  }

  ngOnInit(): void {
    this.store.user$
      .pipe(
        filter((user: IUser) => !!user),
        tap((user: IUser) => (this.user = user)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  ngAfterViewInit() {
    this.permissions$
      .pipe(
        debounceTime(500),
        tap(() => (this.loading = true)),
        filter(() => !!this.role),
        switchMap(() => this.loadPermissions()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.enablePermissionTotals = isNil(this.enabledPermissions) ? 0 : Object.keys(this.enabledPermissions).length
          this._cdr.detectChanges()
        }
      })

    this.roles$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.roles = items
        this.onSelectedRole(this.roles[0])
      }
    })
  }

  async loadPermissions() {
    this.enabledPermissions = {}

    const { tenantId } = this.user
    const { id: roleId } = this.role

    this.permissions = (
      await this.rolePermissionsService
        .selectRolePermissions({
          roleId,
          tenantId
        })
        .finally(() => (this.loading = false))
    ).items

    this.permissions.forEach((p) => {
      this.enabledPermissions[p.permission] = p.enabled
    })
  }

  async permissionChanged(permission: string, enabled: boolean) {
    try {
      const { id: roleId } = this.role
      const { tenantId } = this.user

      const permissionToEdit = this.permissions.find((p) => p.permission === permission)

      permissionToEdit && permissionToEdit.id
        ? await firstValueFrom(
            this.rolePermissionsService.update(permissionToEdit.id, {
              enabled
            })
          )
        : await firstValueFrom(
            this.rolePermissionsService.create({
              roleId,
              permission,
              enabled,
              tenantId
            })
          )

      this._snackBar.open(
        this.getTranslation(`PAC.NOTES.ROLES.PERMISSION_UPDATED`, {
          Default: `Permission '{{name}}' Updated`,
          name: this.role.name
        }),
        '',
        { duration: 2000 }
      )
    } catch (error) {
      // this.toastrService.danger(
      // 	this.getTranslation('TOASTR.MESSAGE.PERMISSION_UPDATE_ERROR'),
      // 	this.getTranslation('TOASTR.TITLE.ERROR')
      // )
    } finally {
      this.permissions$.next()
    }
  }

  /**
   * CHANGE current selected role
   */
  onSelectedRole(role) {
    this.role = role
    this.permissions$.next()
  }

  /**
   * GET role by name
   *
   * @param name
   * @returns
   */
  getRoleByName(name: IRole['name']) {
    return this.roles.find((role: IRole) => name === role.name)
  }

  /***
   * GET Administration permissions & removed some permission in DEMO
   */
  getAdministrationPermissions(): PermissionsEnum[] {
    // removed permissions for all users in DEMO mode
    const deniedPermisisons = [PermissionsEnum.ACCESS_DELETE_ACCOUNT, PermissionsEnum.ACCESS_DELETE_ALL_DATA]

    return this.permissionGroups.ADMINISTRATION.filter((permission) =>
      environment.DEMO ? !deniedPermisisons.includes(permission) : true
    )
  }

  async create() {
    const result = await firstValueFrom(this._dialog.open(NgmConfirmUniqueComponent).afterClosed())
    if (result) {
      const newRole = await firstValueFrom(this.rolesService.create({ name: result, rolePermissions: [] }))
      if (newRole) {
        this.refresh()
        this._toastr.success('PAC.NOTES.ROLES.RoleCreate', {Default: 'Create Role'})
        this.role = newRole
      }
    }
  }

  async remove(role: IRole) {
    const confirm = await firstValueFrom(this._dialog.open(NgmConfirmDeleteComponent, {
      data: {
        value: role.name
      }
    }).afterClosed())
    if (confirm) {
      await firstValueFrom(this.rolesService.delete(role))
      this.refresh()
      this._toastr.success('PAC.NOTES.ROLES.RoleDelete', {Default: 'Delete Role'})
    }
  }

  refresh() {
    this.refresh$.next()
  }

  /**
	 * Disabled General Group Permissions
	 *
	 * @returns
	 */
	isDisabledAdministrationPermissions(): boolean {
		if (!this.role) {
			return true;
		}
		/**
		 * Disabled all administration permissions except "SUPER_ADMIN"
		 */
		if (this.user?.role.name === RolesEnum.SUPER_ADMIN) {
			if (this.role.name === RolesEnum.ADMIN || this.role.name === RolesEnum.TRIAL) {
				return false;
			}
		}
		return true;
	}
}
