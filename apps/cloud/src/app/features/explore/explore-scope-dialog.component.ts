import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { IOrganization, OrganizationsService, RolesEnum, Store } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'

export type ExploreScopeSelection = { kind: 'tenant' } | { kind: 'organization'; organization: IOrganization }

@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent
  ],
  template: `
    <section xpDialogLayout="standard" class="w-[min(480px,calc(100vw-32px))] max-h-[84vh]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ 'XP.Explore.Scope.Select' | translate }}</h2>
        <p xpDialogDescription>{{ 'XP.Explore.Scope.SwitchHint' | translate }}</p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate"
          (click)="dialogRef.close()"
        >
          <z-icon zType="x" />
        </button>
      </header>
      <div xpDialogBody class="space-y-3">
        @if (data.allowTenant) {
          <button z-button zType="outline" type="button" class="w-full justify-start" (click)="selectTenant()">
            <z-icon zType="globe" />{{ 'XP.Explore.Scope.Tenant' | translate }}
          </button>
        }
        <z-search-input [placeholder]="'XP.KEY_WORDS.Search' | translate" [(ngModel)]="search" />
        @if (loading()) {
          <p role="status" class="py-6 text-center text-sm text-muted-foreground">
            {{ 'XP.Organization.Loading' | translate }}
          </p>
        } @else if (failed()) {
          <p class="text-sm text-muted-foreground">{{ 'XP.Explore.Scope.LoadFailed' | translate }}</p>
          <button z-button zType="outline" type="button" (click)="load()">
            {{ 'XP.Explore.AgentSquare.TryAgain' | translate }}
          </button>
        } @else {
          <div class="space-y-1">
            @for (organization of filteredOrganizations(); track organization.id) {
              <button
                z-button
                zType="ghost"
                type="button"
                class="w-full justify-start text-left"
                (click)="selectOrganization(organization)"
              >
                <z-icon zType="building-2" /><span class="truncate">{{ organization.name }}</span>
              </button>
            } @empty {
              <p class="py-6 text-sm text-muted-foreground">
                {{
                  (organizations().length ? 'XP.Organization.EmptySearch' : 'XP.Explore.Scope.NoOrganizations')
                    | translate
                }}
              </p>
            }
          </div>
        }
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="dialogRef.close()">
          {{ 'XP.Explore.Scope.KeepBrowsing' | translate }}
        </button>
      </footer>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreScopeDialogComponent {
  readonly dialogRef = inject(DialogRef<ExploreScopeSelection>)
  readonly data = inject<{ allowTenant: boolean }>(DIALOG_DATA)
  readonly #store = inject(Store)
  readonly #organizations = inject(OrganizationsService)
  readonly organizations = signal<IOrganization[]>([])
  readonly loading = signal(true)
  readonly failed = signal(false)
  readonly search = signal('')
  readonly filteredOrganizations = computed(() =>
    this.organizations().filter((org) => org.name.toLowerCase().includes(this.search().trim().toLowerCase()))
  )

  constructor() {
    void this.load()
  }

  async load() {
    this.loading.set(true)
    this.failed.set(false)
    try {
      const items =
        this.#store.user?.role?.name === RolesEnum.SUPER_ADMIN
          ? (
              await firstValueFrom(
                this.#organizations.getAll(['featureOrganizations', 'featureOrganizations.feature'], { isActive: true })
              )
            ).items
          : (this.#store.user?.organizations ?? [])
              .filter((membership) => membership.isActive !== false)
              .flatMap((membership) => (membership.organization ? [membership.organization] : []))
      this.organizations.set(items.filter((org) => org.isActive !== false))
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  selectOrganization(organization: IOrganization) {
    this.dialogRef.close({ kind: 'organization', organization })
  }
  selectTenant() {
    this.dialogRef.close({ kind: 'tenant' })
  }
}
