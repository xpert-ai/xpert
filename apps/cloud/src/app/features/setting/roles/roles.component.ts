import { CommonModule } from '@angular/common'
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  TemplateRef,
  ViewChild,
  inject
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs'
import { debounceTime, filter, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { environment } from '../../../../environments/environment'
import {
  ZardAlertDialogService,
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardDialogService,
  ZardDividerComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardRadioComponent,
  ZardRadioGroupComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  IRole,
  IRolePermission,
  IUser,
  PermissionGroups,
  PermissionsEnum,
  RequestScopeLevel,
  RolePermissionsService,
  RolesEnum,
  RoleService,
  Store,
  ToastrService
} from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { isDeprecatedRolePermission, isRolePermissionReadonly } from './deprecated-permissions'

@Component({
  standalone: true,
  selector: 'pac-roles',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardDividerComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardRadioComponent,
    ZardRadioGroupComponent,
    ...ZardCardImports,
    ...ZardTooltipImports
  ],
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent extends TranslationBaseComponent implements OnInit, AfterViewInit {
  readonly destroyRef = inject(DestroyRef)
  private readonly rolePermissionsService = inject(RolePermissionsService)
  private readonly rolesService = inject(RoleService)
  private readonly store = inject(Store)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly dialog = inject(ZardDialogService)
  private readonly alertDialog = inject(ZardAlertDialogService)
  private readonly toastr = inject(ToastrService)

  @ViewChild('roleNameDialog', { read: TemplateRef }) roleNameDialog?: TemplateRef<unknown>

  permissionGroups = PermissionGroups

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly roles$ = this.refresh$.pipe(
    switchMap(() => this.rolesService.getAll()),
    map(({ items }) => items),
    shareReplay(1)
  )

  user: IUser
  role: IRole
  permissions: IRolePermission[] = []
  loading = false
  enabledPermissions: Record<string, boolean> = {}
  permissions$: Subject<void> = new Subject()
  syncingDefaults = false
  roleNameDialogTitle = ''
  roleNameDialogLabel = ''
  roleNameDialogAction = ''
  roleNameDraft = ''

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
          this.cdr.detectChanges()
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

      if (permissionToEdit?.id) {
        await firstValueFrom(
          this.rolePermissionsService.update(permissionToEdit.id, {
            enabled
          })
        )
      } else {
        await firstValueFrom(
          this.rolePermissionsService.create({
            roleId,
            permission,
            enabled,
            tenantId
          })
        )
      }

      this.toastr.success(
        this.getTranslation(`PAC.NOTES.ROLES.PERMISSION_UPDATED`, {
          Default: `Permission '{{name}}' Updated`,
          name: this.role.name
        })
      )
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
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

  onSelectedRoleId(roleId: string, roles: IRole[]) {
    const selectedRole = roles.find((item) => item.id === roleId)
    if (selectedRole) {
      this.onSelectedRole(selectedRole)
    }
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
    const name = await this.openRoleNameDialog({
      title: this.getTranslation('PAC.Role.CreateTitle', {
        Default: 'Create role'
      }),
      label: this.getTranslation('PAC.Role.NameLabel', {
        Default: 'Role name'
      }),
      action: this.getTranslation('PAC.MODEL.AccessControl.NewRole', {
        Default: 'New Role'
      })
    })
    if (!name) {
      return
    }

    try {
      const newRole = await firstValueFrom(this.rolesService.create({ name, rolePermissions: [] }))
      if (newRole) {
        this.refresh()
        this.toastr.success('PAC.NOTES.ROLES.RoleCreate', { Default: 'Create Role' })
        this.role = newRole
      }
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }

  async rename(role: IRole) {
    if (!role || role.isSystem) {
      return
    }

    const name = await this.openRoleNameDialog({
      title: this.getTranslation('PAC.Role.RenameTitle', {
        Default: 'Rename Role'
      }),
      label: this.getTranslation('PAC.Role.NameLabel', {
        Default: 'Role name'
      }),
      action: this.getTranslation('PAC.ACTIONS.Rename', {
        Default: 'Rename'
      }),
      value: role.name
    })
    if (!name || name === role.name) {
      return
    }

    try {
      const updatedRole = await firstValueFrom(this.rolesService.update(role.id, { name }))
      this.role = updatedRole
      this.refresh()
      this.toastr.success('PAC.Role.RenameSuccess', {
        Default: 'Role renamed successfully'
      })
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }

  async remove(role: IRole) {
    const confirm = await firstValueFrom(
      this.alertDialog.confirm({
        title: this.getTranslation('PAC.Role.DeleteTitle', {
          Default: 'Delete role'
        }),
        description: this.getTranslation('PAC.Role.DeleteConfirm', {
          Default: 'Delete role "{{name}}"? This cannot be undone.',
          name: role.name
        }),
        actionText: this.getTranslation('PAC.ACTIONS.Delete', {
          Default: 'Delete'
        }),
        cancelText: this.getTranslation('PAC.ACTIONS.Cancel', {
          Default: 'Cancel'
        }),
        destructive: true
      })
    )
    if (confirm) {
      try {
        await firstValueFrom(this.rolesService.delete(role))
        this.refresh()
        this.toastr.success('PAC.NOTES.ROLES.RoleDelete', { Default: 'Delete Role' })
      } catch (error) {
        this.toastr.error(getErrorMessage(error))
      }
    }
  }

  refresh() {
    this.refresh$.next()
  }

  isTenantScope(): boolean {
    return this.store.activeScope?.level === RequestScopeLevel.TENANT
  }

  async syncDefaultPermissions() {
    if (!this.isTenantScope() || this.syncingDefaults) {
      return
    }

    this.syncingDefaults = true
    try {
      const result = await firstValueFrom(this.rolePermissionsService.syncDefaults())
      this.permissions$.next()
      this.refresh()
      this.toastr.success('PAC.Role.SyncDefaultsSuccess', {
        Default: 'Default role permissions synchronized.',
        inserted: result.inserted,
        enabled: result.enabled
      })
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.syncingDefaults = false
    }
  }

  allPermissions(): string[] {
    return [...this.permissionGroups.GENERAL, ...this.getAdministrationPermissions()]
  }

  enabledPermissionCount(permissions: readonly string[]): number {
    return permissions.reduce((count, permission) => count + (this.enabledPermissions[permission] ? 1 : 0), 0)
  }

  isDeprecatedPermission(permission: string): boolean {
    return isDeprecatedRolePermission(permission)
  }

  isDisabledGeneralPermissions(): boolean {
    return isRolePermissionReadonly(this.role?.name)
  }

  /**
   * Disabled Administration Group Permissions
   *
   * @returns
   */
  isDisabledAdministrationPermissions(): boolean {
    if (!this.role) {
      return true
    }
    if (isRolePermissionReadonly(this.role.name)) {
      return true
    }
    if (this.user?.role.name === RolesEnum.SUPER_ADMIN) {
      return false
    }
    return true
  }

  private async openRoleNameDialog(options: { title: string; label: string; action: string; value?: string }) {
    if (!this.roleNameDialog) {
      return null
    }

    this.roleNameDialogTitle = options.title
    this.roleNameDialogLabel = options.label
    this.roleNameDialogAction = options.action
    this.roleNameDraft = options.value ?? ''

    const result = await firstValueFrom(
      this.dialog
        .open(this.roleNameDialog, {
          width: 'min(420px, calc(100vw - 2rem))'
        })
        .afterClosed()
    )
    const name = typeof result === 'string' ? result.trim() : ''
    return name || null
  }
}
