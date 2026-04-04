import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core'
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs'
import { debounceTime, filter, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { environment } from '../../../../environments/environment'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  IRole,
  IRolePermission,
  IUser,
  LEGACY_DEFAULT_ROLES,
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
import { NgmConfirmDeleteService, NgmConfirmUniqueComponent } from '@metad/ocap-angular/common'

@Component({
  standalone: false,
  selector: 'pac-roles',
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent extends TranslationBaseComponent implements OnInit {
  readonly destroyRef = inject(DestroyRef)
  
  permissionGroups = PermissionGroups

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly roles$ = this.refresh$.pipe(switchMap(() => this.rolesService.getAll()),
    map(({ items }) => items.filter((role) => !LEGACY_DEFAULT_ROLES.includes(role.name as RolesEnum))),
    shareReplay(1)
  )

  user: IUser
  role: IRole
  permissions: IRolePermission[] = []
  // selectedRole: RolesEnum[] = [RolesEnum.EMPLOYEE]

  loading = false
  enabledPermissions: Record<string, boolean> = {}
  permissions$: Subject<void> = new Subject()

  constructor(
    private readonly rolePermissionsService: RolePermissionsService,
    private readonly rolesService: RoleService,
    private readonly store: Store,
    private _cdr: ChangeDetectorRef,
    private readonly _dialog: ZardDialogService,
    private readonly _confirmDelete: NgmConfirmDeleteService,
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
          this._cdr.detectChanges()
        }
      })

    this.roles$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        const currentRoleId = this.role?.id
        this.onSelectedRole(items.find((item) => item.id === currentRoleId) ?? items[0] ?? null)
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

      this._toastr.success(
        this.getTranslation(`PAC.NOTES.ROLES.PERMISSION_UPDATED`, {
          Default: `Permission '{{name}}' Updated`,
          name: this.role.name
        }),
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
  onSelectedRole(role: IRole | null) {
    this.role = role
    if (!role) {
      this.permissions = []
      this.enabledPermissions = {}
      return
    }

    this.permissions$.next()
  }

  /***
   * GET Administration permissions & removed some permission in DEMO
   */
  getAdministrationPermissions(): string[] {
    // removed permissions for all users in DEMO mode
    const deniedPermisisons = [PermissionsEnum.ACCESS_DELETE_ACCOUNT, PermissionsEnum.ACCESS_DELETE_ALL_DATA]

    return this.permissionGroups.ADMINISTRATION.filter((permission) =>
      environment.DEMO ? !deniedPermisisons.includes(permission) : true
    )
  }

  async create() {
    const result = await firstValueFrom(this._dialog.open(NgmConfirmUniqueComponent).afterClosed())
    if (!result) {
      return
    }

    try {
      const newRole = await firstValueFrom(this.rolesService.create({ name: result, rolePermissions: [] }))
      if (newRole) {
        this.refresh()
        this._toastr.success('PAC.NOTES.ROLES.RoleCreate', {Default: 'Create Role'})
        this.role = newRole
      }
    } catch (error) {
      this._toastr.error(getErrorMessage(error))
    }
  }

  async rename(role: IRole) {
    if (!role || role.isSystem) {
      return
    }

    const result = await firstValueFrom(
      this._dialog.open(NgmConfirmUniqueComponent, {
        data: {
          title: this.getTranslation('PAC.Role.RenameTitle', {
            Default: 'Rename Role'
          }),
          value: role.name
        }
      }).afterClosed()
    )

    const name = result?.trim?.() ?? result
    if (!name || name === role.name) {
      return
    }

    try {
      const updatedRole = await firstValueFrom(this.rolesService.update(role.id, { name }))
      this.role = updatedRole
      this.refresh()
      this._toastr.success('PAC.Role.RenameSuccess', {
        Default: 'Role renamed successfully'
      })
    } catch (error) {
      this._toastr.error(getErrorMessage(error))
    }
  }

  async remove(role: IRole) {
    const confirm = await firstValueFrom(this._confirmDelete.confirm({ value: role.name }))
    if (confirm) {
      try {
        await firstValueFrom(this.rolesService.delete(role))
        this.refresh()
        this._toastr.success('PAC.NOTES.ROLES.RoleDelete', {Default: 'Delete Role'})
      } catch (error) {
        this._toastr.error(getErrorMessage(error))
      }
    }
  }

  refresh() {
    this.refresh$.next()
  }

  allPermissions(): string[] {
    return [...this.permissionGroups.GENERAL, ...this.getAdministrationPermissions()]
  }

  enabledPermissionCount(permissions: readonly string[]): number {
    return permissions.reduce((count, permission) => count + (this.enabledPermissions[permission] ? 1 : 0), 0)
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
