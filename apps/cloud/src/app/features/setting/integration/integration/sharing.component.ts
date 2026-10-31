import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IOrganization, IntegrationSharingPolicy, IntegrationUsage } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardCheckboxComponent, ZardSelectImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, IntegrationService, OrganizationsService } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xp-integration-sharing',
  imports: [FormsModule, TranslateModule, ZardButtonComponent, ZardCheckboxComponent, ...ZardSelectImports],
  template: `
    <section class="grid gap-4 border-t border-border pt-6" aria-labelledby="integration-sharing-title">
      <div>
        <h2 id="integration-sharing-title" class="text-base font-semibold">
          {{ 'XP.Integration.Sharing.Title' | translate }}
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'XP.Integration.Sharing.Hint' | translate }}</p>
      </div>
      @if (!hasPolicy()) {
        <p class="text-sm text-muted-foreground">{{ 'XP.Integration.Sharing.ReviewRequired' | translate }}</p>
      }
      <z-select
        [ngModel]="visibility()"
        (ngModelChange)="setVisibility($event)"
        [zDisabled]="saving()"
        [ngModelOptions]="{ standalone: true }"
      >
        @for (mode of modes; track mode) {
          <z-select-item [zValue]="mode">{{ 'XP.Integration.Sharing.' + mode | translate }}</z-select-item>
        }
      </z-select>
      @if (visibility() === 'selected-organizations') {
        <fieldset class="grid max-h-60 gap-2 overflow-auto">
          <legend class="mb-2 text-sm font-medium">{{ 'XP.Integration.Sharing.Organizations' | translate }}</legend>
          @for (organization of organizations(); track organization.id) {
            <z-checkbox
              [ngModel]="organizationIds().includes(organization.id)"
              [ngModelOptions]="{ standalone: true }"
              [zDisabled]="saving()"
              (ngModelChange)="toggleOrganization(organization.id, $event)"
            >
              {{ organization.name }}
            </z-checkbox>
          }
          @if (loading()) {
            <p role="status">{{ 'XP.Integration.Sharing.Loading' | translate }}</p>
          }
          @if (!loading() && !loadError() && !organizations().length) {
            <p role="status">{{ 'XP.Integration.Sharing.EmptyOrganizations' | translate }}</p>
          }
          @if (loadError()) {
            <p role="alert" class="text-sm text-destructive">{{ loadError() }}</p>
            <button z-button zType="outline" type="button" (click)="loadOrganizations()">
              {{ 'XP.Integration.Sharing.Retry' | translate }}
            </button>
          }
        </fieldset>
      }
      @if (visibility() !== 'private') {
        <fieldset class="grid gap-3">
          <legend class="mb-2 text-sm font-medium">{{ 'XP.Integration.Sharing.Usages' | translate }}</legend>
          @for (usage of usageOptions; track usage) {
            <z-checkbox
              [ngModel]="usages().includes(usage)"
              [ngModelOptions]="{ standalone: true }"
              [zDisabled]="saving()"
              (ngModelChange)="toggleUsage(usage, $event)"
            >
              {{ 'XP.Integration.Sharing.' + usage | translate }}
            </z-checkbox>
          }
        </fieldset>
      }
      <p class="text-sm text-muted-foreground">{{ 'XP.Integration.Sharing.RevokeHint' | translate }}</p>
      @if (error()) {
        <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
      }
      @if (saved()) {
        <p role="status" class="text-sm">{{ 'XP.Integration.Sharing.Saved' | translate }}</p>
      }
      <button z-button type="button" class="w-fit" [zDisabled]="!valid() || !dirty() || saving()" (click)="save()">
        {{ (saving() ? 'XP.Integration.Sharing.Saving' : 'XP.Integration.Sharing.Save') | translate }}
      </button>
    </section>
  `
})
export class IntegrationSharingComponent {
  private readonly api = inject(IntegrationService)
  private readonly organizationsApi = inject(OrganizationsService)
  readonly integrationId = input.required<string>()
  readonly sharing = input<IntegrationSharingPolicy | null>()
  readonly modes = ['private', 'all-organizations', 'selected-organizations'] as const
  readonly usageOptions: IntegrationUsage[] = ['configuration', 'invoke', 'bind']
  readonly visibility = signal<IntegrationSharingPolicy['visibility']>('private')
  readonly organizationIds = signal<string[]>([])
  readonly usages = signal<IntegrationUsage[]>([])
  readonly organizations = signal<IOrganization[]>([])
  readonly loading = signal(false)
  readonly loadError = signal('')
  readonly saving = signal(false)
  readonly saved = signal(false)
  readonly hasPolicy = signal(false)
  readonly error = signal('')
  readonly dirty = signal(false)
  readonly valid = computed(
    () =>
      this.visibility() === 'private' ||
      (this.usages().length > 0 &&
        (this.visibility() !== 'selected-organizations' || this.organizationIds().length > 0))
  )

  constructor() {
    effect(() => {
      const sharing = this.sharing()
      this.integrationId()
      this.visibility.set(sharing?.visibility ?? 'private')
      this.organizationIds.set(sharing?.organizationIds ?? [])
      this.usages.set(sharing?.usages ?? [])
      this.hasPolicy.set(!!sharing)
      this.saved.set(false)
      this.error.set('')
      this.dirty.set(false)
    })
    void this.loadOrganizations()
  }

  async loadOrganizations() {
    this.loading.set(true)
    this.loadError.set('')
    try {
      this.organizations.set((await firstValueFrom(this.organizationsApi.getAll([], { isActive: true }))).items)
    } catch (error) {
      this.loadError.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  setVisibility(value: IntegrationSharingPolicy['visibility']) {
    this.visibility.set(value)
    this.changed()
  }
  toggleOrganization(id: string, checked: boolean) {
    this.organizationIds.update((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id)))
    this.changed()
  }
  toggleUsage(usage: IntegrationUsage, checked: boolean) {
    this.usages.update((values) =>
      checked ? [...new Set([...values, usage])] : values.filter((value) => value !== usage)
    )
    this.changed()
  }
  private changed() {
    this.dirty.set(true)
    this.saved.set(false)
  }
  async save() {
    if (!this.valid() || this.saving()) return
    this.saving.set(true)
    this.error.set('')
    try {
      await firstValueFrom(
        this.api.updateSharing(this.integrationId(), {
          visibility: this.visibility(),
          organizationIds: this.visibility() === 'selected-organizations' ? this.organizationIds() : [],
          usages: this.visibility() === 'private' ? [] : this.usages()
        })
      )
      this.dirty.set(false)
      this.saved.set(true)
      this.hasPolicy.set(true)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
