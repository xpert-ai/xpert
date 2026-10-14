import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  Component,
  DestroyRef,
  OnInit,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  computed,
  inject,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ROLE_PERMISSION_MODULES, RolePermissionModule } from '@xpert-ai/contracts'
import {
  ZardAccordionImports,
  ZardAlertDialogService,
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardComboboxOption,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardSwitchComponent,
  ZardTableImports,
  ZardTabsImports,
  ZardTooltipImports,
  XpDialogFrameImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import {
  Bot,
  CheckCheck,
  CreditCard,
  Database,
  FolderKanban,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  CircleHelp,
  LucideIconData
} from 'lucide-angular'
import { environment } from '../../../../environments/environment'
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
import { isDeprecatedRolePermission, isRolePermissionReadonly } from './deprecated-permissions'

const MODULES: readonly RolePermissionModule[] = ['ai', 'projects', 'members', 'billing', 'data', 'personal', 'other']
const KNOWN_ROLES = new Set<string>(Object.values(RolesEnum))
type PermissionTab = 'active' | 'deprecated'
type PermissionStatus = 'all' | 'enabled' | 'disabled'
interface PermissionRow {
  id: string
  label: string
  module: RolePermissionModule
  administration: boolean
  deprecated: boolean
  enabled: boolean
}

@Component({
  standalone: true,
  selector: 'xp-roles',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardAccordionImports,
    ...ZardMenuImports,
    ...ZardTableImports,
    ...ZardTabsImports,
    ...ZardTooltipImports,
    ...XpDialogFrameImports
  ],
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent extends TranslationBaseComponent implements OnInit {
  readonly icons = { CheckCheck, LockKeyhole, ShieldCheck, SlidersHorizontal }
  readonly moduleIcons: Readonly<Record<RolePermissionModule, LucideIconData>> = {
    ai: Bot,
    projects: FolderKanban,
    members: Users,
    billing: CreditCard,
    data: Database,
    personal: User,
    other: CircleHelp
  }
  readonly destroyRef = inject(DestroyRef)
  private readonly rolePermissionsService = inject(RolePermissionsService)
  private readonly rolesService = inject(RoleService)
  private readonly store = inject(Store)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly dialog = inject(Dialog)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private readonly alertDialog = inject(ZardAlertDialogService)
  private readonly toastr = inject(ToastrService)

  @ViewChild('roleNameDialog', { read: TemplateRef }) roleNameDialog?: TemplateRef<unknown>

  readonly roles = signal<IRole[]>([])
  readonly role = signal<IRole | null>(null)
  readonly user = signal<IUser | null>(null)
  readonly requestedRoleId = signal<string | null>(null)
  readonly permissions = signal<IRolePermission[]>([])
  readonly rolesLoading = signal(true)
  readonly rolesError = signal('')
  readonly permissionsLoading = signal(false)
  readonly permissionsError = signal('')
  readonly savingPermission = signal<string | null>(null)
  readonly directoryQuery = signal('')
  readonly query = signal('')
  readonly activeTab = signal<PermissionTab>('active')
  readonly moduleFilter = signal('all')
  readonly statusFilter = signal<PermissionStatus>('all')
  readonly collapsedModules = signal<ReadonlySet<RolePermissionModule>>(new Set())
  private readonly locale = signal('')
  private rolesRequest = 0
  private permissionRequest = 0
  syncingDefaults = false
  roleNameDialogTitle = ''
  roleNameDialogLabel = ''
  roleNameDialogAction = ''
  roleNameDraft = ''

  readonly readonlyRole = computed(() => isRolePermissionReadonly(this.role()?.name))
  readonly administrationReadonly = computed(
    () => this.readonlyRole() || this.user()?.role?.name !== RolesEnum.SUPER_ADMIN
  )
  readonly enabledPermissions = computed(
    () => new Map(this.permissions().map((item) => [item.permission, item.enabled]))
  )
  readonly filteredRoles = computed(() => {
    const query = this.directoryQuery().trim().toLocaleLowerCase()
    return this.roles().filter((role) => `${role.name} ${this.roleLabel(role)}`.toLocaleLowerCase().includes(query))
  })
  readonly roleOptions = computed<ZardComboboxOption[]>(() =>
    this.roles().map((role) => ({ value: role.id, label: this.roleLabel(role) }))
  )
  readonly permissionRows = computed<PermissionRow[]>(() => {
    this.locale()
    const administration = new Set<string>(this.getAdministrationPermissions())
    return [...PermissionGroups.GENERAL, ...administration].map((id) => ({
      id,
      label: this.label(`XP.ORGANIZATIONS_PAGE.PERMISSIONS.${id}`, id),
      module: ROLE_PERMISSION_MODULES.get(id) ?? 'other',
      administration: administration.has(id),
      deprecated: isDeprecatedRolePermission(id),
      enabled: !!this.enabledPermissions().get(id)
    }))
  })
  readonly activeCount = computed(() => this.permissionRows().filter((row) => !row.deprecated).length)
  readonly deprecatedCount = computed(() => this.permissionRows().filter((row) => row.deprecated).length)
  readonly enabledCount = computed(() => this.permissionRows().filter((row) => row.enabled).length)
  readonly filteredPermissions = computed(() => {
    const query = this.query().trim().toLocaleLowerCase()
    return this.permissionRows().filter(
      (row) =>
        row.deprecated === (this.activeTab() === 'deprecated') &&
        (this.moduleFilter() === 'all' || row.module === this.moduleFilter()) &&
        (this.statusFilter() === 'all' || row.enabled === (this.statusFilter() === 'enabled')) &&
        `${row.label} ${row.id}`.toLocaleLowerCase().includes(query)
    )
  })
  readonly groups = computed(() =>
    MODULES.map((id) => {
      const rows = this.filteredPermissions().filter((row) => row.module === id)
      return { id, rows, enabled: rows.filter((row) => row.enabled).length }
    }).filter((group) => group.rows.length)
  )
  readonly moduleOptions = computed<ZardComboboxOption[]>(() => [
    { value: 'all', label: this.label('XP.RoleWorkspace.AllModules') },
    ...MODULES.filter((id) =>
      this.permissionRows().some((row) => row.module === id && row.deprecated === (this.activeTab() === 'deprecated'))
    ).map((id) => ({ value: id, label: this.label(`XP.RoleWorkspace.Modules.${id}`) }))
  ])
  readonly statusOptions = computed<ZardComboboxOption[]>(() =>
    ['all', 'enabled', 'disabled'].map((value) => ({
      value,
      label: this.label(`XP.RoleWorkspace.Status.${value}`)
    }))
  )
  readonly hasFilters = computed(() => !!this.query() || this.moduleFilter() !== 'all' || this.statusFilter() !== 'all')

  ngOnInit(): void {
    this.translateService.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ lang }) => this.locale.set(lang))
    this.store.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
      const tenantChanged = this.user()?.tenantId !== user?.tenantId
      this.user.set(user)
      if (tenantChanged && this.role()) void this.loadPermissions()
    })
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.requestedRoleId.set(params.get('role'))
      this.resolveRole()
    })
    void this.refresh()
  }

  label(key: string, fallback = key): string {
    this.locale()
    const value = this.translateService.instant(key)
    return typeof value === 'string' && value !== key ? value : fallback
  }

  roleLabel(role: IRole): string {
    return KNOWN_ROLES.has(role.name) ? this.label(`XP.RoleWorkspace.RoleNames.${role.name}`, role.name) : role.name
  }

  isReadonlyRole(role: IRole): boolean {
    return isRolePermissionReadonly(role.name)
  }

  async selectRole(roleId: string | null): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { role: roleId },
      queryParamsHandling: 'merge'
    })
  }

  private resolveRole(): void {
    const next = this.roles().find((role) => role.id === this.requestedRoleId()) ?? null
    const changed = next?.id !== this.role()?.id
    this.role.set(next)
    if (changed) {
      this.activeTab.set('active')
      this.clearFilters()
      void this.loadPermissions()
    }
  }

  async refresh(): Promise<void> {
    const request = ++this.rolesRequest
    this.rolesLoading.set(true)
    this.rolesError.set('')
    try {
      const { items } = await firstValueFrom(this.rolesService.getAll())
      if (this.destroyRef.destroyed || request !== this.rolesRequest) return
      this.roles.set(items)
      this.resolveRole()
    } catch (error) {
      if (!this.destroyRef.destroyed && request === this.rolesRequest) this.rolesError.set(getErrorMessage(error))
    } finally {
      if (!this.destroyRef.destroyed && request === this.rolesRequest) this.rolesLoading.set(false)
    }
  }

  async loadPermissions(): Promise<void> {
    const request = ++this.permissionRequest
    const roleId = this.role()?.id
    const tenantId = this.user()?.tenantId
    this.permissions.set([])
    this.permissionsError.set('')
    this.permissionsLoading.set(!!roleId)
    if (!roleId || !tenantId) return
    try {
      const { items } = await this.rolePermissionsService.selectRolePermissions({ roleId, tenantId })
      if (!this.destroyRef.destroyed && request === this.permissionRequest) this.permissions.set(items)
    } catch (error) {
      if (!this.destroyRef.destroyed && request === this.permissionRequest)
        this.permissionsError.set(getErrorMessage(error))
    } finally {
      if (!this.destroyRef.destroyed && request === this.permissionRequest) this.permissionsLoading.set(false)
    }
  }

  async permissionChanged(permission: string, enabled: boolean, source?: ZardSwitchComponent): Promise<void> {
    const row = this.permissionRows().find((item) => item.id === permission)
    // Keep the control at the confirmed server value until the mutation succeeds.
    source?.writeValue(row?.enabled ?? false)
    const role = this.role()
    const tenantId = this.user()?.tenantId
    if (
      !role?.id ||
      !tenantId ||
      !row ||
      this.readonlyRole() ||
      (row.administration && this.administrationReadonly()) ||
      this.permissionsLoading() ||
      this.permissionsError() ||
      this.savingPermission() ||
      row.enabled === enabled
    )
      return
    const record = this.permissions().find((item) => item.permission === permission)
    this.savingPermission.set(permission)
    try {
      if (record?.id) await firstValueFrom(this.rolePermissionsService.update(record.id, { enabled }))
      else await firstValueFrom(this.rolePermissionsService.create({ roleId: role.id, permission, enabled, tenantId }))
      this.toastr.success(this.getTranslation('XP.NOTES.ROLES.PERMISSION_UPDATED', { name: role.name }))
      if (!this.destroyRef.destroyed && this.role()?.id === role.id && this.user()?.tenantId === tenantId)
        await this.loadPermissions()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      if (!this.destroyRef.destroyed) this.savingPermission.set(null)
    }
  }

  setQuery(value: string): void {
    this.query.set(value)
    this.collapsedModules.set(new Set())
  }
  setTab(tab: PermissionTab): void {
    this.activeTab.set(tab)
    this.clearFilters()
  }
  clearFilters(): void {
    this.query.set('')
    this.moduleFilter.set('all')
    this.statusFilter.set('all')
    this.collapsedModules.set(new Set())
  }
  setModule(value: string): void {
    this.moduleFilter.set(value)
    this.collapsedModules.set(new Set())
  }
  setStatus(value: string): void {
    if (value === 'all' || value === 'enabled' || value === 'disabled') this.statusFilter.set(value)
    this.collapsedModules.set(new Set())
  }
  setExpanded(module: RolePermissionModule, expanded: boolean): void {
    const next = new Set(this.collapsedModules())
    if (expanded) next.delete(module)
    else next.add(module)
    this.collapsedModules.set(next)
  }
  getAdministrationPermissions(): string[] {
    return PermissionGroups.ADMINISTRATION.filter(
      (permission) =>
        !environment.DEMO ||
        (permission !== PermissionsEnum.ACCESS_DELETE_ACCOUNT && permission !== PermissionsEnum.ACCESS_DELETE_ALL_DATA)
    )
  }

  async create() {
    const name = await this.openRoleNameDialog({
      title: this.getTranslation('XP.Role.CreateTitle', {
        Default: 'Create role'
      }),
      label: this.getTranslation('XP.Role.NameLabel', {
        Default: 'Role name'
      }),
      action: this.getTranslation('XP.MODEL.AccessControl.NewRole', {
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
        this.toastr.success('XP.NOTES.ROLES.RoleCreate', { Default: 'Create Role' })
        await this.selectRole(newRole.id)
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
      title: this.getTranslation('XP.Role.RenameTitle', {
        Default: 'Rename Role'
      }),
      label: this.getTranslation('XP.Role.NameLabel', {
        Default: 'Role name'
      }),
      action: this.getTranslation('XP.ACTIONS.Rename', {
        Default: 'Rename'
      }),
      value: role.name
    })
    if (!name || name === role.name) {
      return
    }

    try {
      const updatedRole = await firstValueFrom(this.rolesService.update(role.id, { name }))
      if (this.role()?.id === role.id) this.role.set(updatedRole)
      this.refresh()
      this.toastr.success('XP.Role.RenameSuccess', {
        Default: 'Role renamed successfully'
      })
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }

  async remove(role: IRole) {
    if (!role || role.isSystem) return
    const confirm = await firstValueFrom(
      this.alertDialog.confirm({
        layout: 'standard',
        title: this.getTranslation('XP.Role.DeleteTitle', {
          Default: 'Delete role'
        }),
        description: this.getTranslation('XP.Role.DeleteConfirm', {
          Default: 'Delete role "{{name}}"? This cannot be undone.',
          name: role.name
        }),
        actionText: this.getTranslation('XP.ACTIONS.Delete', {
          Default: 'Delete'
        }),
        cancelText: this.getTranslation('XP.ACTIONS.Cancel', {
          Default: 'Cancel'
        }),
        destructive: true
      })
    )
    if (confirm) {
      try {
        await firstValueFrom(this.rolesService.delete(role))
        if (this.role()?.id === role.id) await this.selectRole(null)
        this.refresh()
        this.toastr.success('XP.NOTES.ROLES.RoleDelete', { Default: 'Delete Role' })
      } catch (error) {
        this.toastr.error(getErrorMessage(error))
      }
    }
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
      void this.loadPermissions()
      this.refresh()
      this.toastr.success('XP.Role.SyncDefaultsSuccess', {
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

  private async openRoleNameDialog(options: { title: string; label: string; action: string; value?: string }) {
    if (!this.roleNameDialog) {
      return null
    }

    this.roleNameDialogTitle = options.title
    this.roleNameDialogLabel = options.label
    this.roleNameDialogAction = options.action
    this.roleNameDraft = options.value ?? ''

    const result = await firstValueFrom(
      this.dialog.open(this.roleNameDialog, {
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'xp-overlay-pane-dialog',
        backdropClass: 'backdrop-blur-xs-black',
        ariaLabelledBy: 'role-name-dialog-title',
        autoFocus: 'input',
        viewContainerRef: this.viewContainerRef
      }).closed
    )
    const name = typeof result === 'string' ? result.trim() : ''
    return name || null
  }
}
