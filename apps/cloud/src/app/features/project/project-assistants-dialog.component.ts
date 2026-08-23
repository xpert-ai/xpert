import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { IXpert, IXpertProject } from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { XpertProjectApiService } from './project-api.service'

export interface XpertProjectAssistantsDialogData {
  project: IXpertProject
  workspaceXperts: IXpert[]
}

@Component({
  standalone: true,
  selector: 'xp-project-assistants-dialog',
  imports: [CommonModule, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ...ZardSelectImports],
  template: `
    <section class="flex max-h-[82vh] min-w-0 flex-col">
      <header class="flex items-start justify-between border-b border-divider-subtle pb-4">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.ProjectAssistant' | translate }}
          </p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">
            {{ 'XP.XProject.ProjectExperts' | translate }}
          </h2>
          <p class="mt-1 text-sm text-text-secondary">
            {{ 'XP.XProject.ProjectExpertsDescription' | translate }}
          </p>
        </div>
        <button
          z-button
          zType="ghost"
          zSize="sm"
          type="button"
          [attr.aria-label]="'XP.XProject.Close' | translate"
          (click)="close()"
        >
          <i class="ri-close-line"></i>
        </button>
      </header>

      <div class="min-h-0 space-y-5 overflow-y-auto py-5">
        <section class="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <i class="ri-sparkling-2-line"></i>
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-text-primary">
                  {{ defaultAssistant()?.title || defaultAssistant()?.name || ('XP.XProject.NotSelected' | translate) }}
                </p>
                <p class="mt-1 text-xs text-text-secondary">
                  {{ 'XP.XProject.DefaultProjectAssistant' | translate }}
                </p>
              </div>
            </div>
            @if (defaultAssistant()) {
              <z-badge zType="secondary">{{ 'XP.XProject.DefaultXpert' | translate }}</z-badge>
            }
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-text-primary">{{ 'XP.XProject.ProjectExperts' | translate }}</h3>
              <p class="mt-1 text-xs text-text-secondary">
                {{ 'XP.XProject.ProjectExpertsMembersDescription' | translate }}
              </p>
            </div>
            <z-badge zType="outline">{{ members().length }}</z-badge>
          </div>

          <div class="divide-y divide-divider-subtle rounded-xl border border-divider-subtle">
            @for (assistant of members(); track assistant.id) {
              <div class="flex items-center justify-between gap-3 p-3">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-components-item-bg text-text-secondary"
                  >
                    <i class="ri-user-star-line"></i>
                  </span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-text-primary">
                      {{ assistant.title || assistant.name }}
                    </p>
                    <p class="truncate text-xs text-text-tertiary">{{ assistant.slug }}</p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  @if (isDefault(assistant.id)) {
                    <z-badge zType="secondary">{{ 'XP.XProject.DefaultXpert' | translate }}</z-badge>
                  } @else {
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      [disabled]="busy()"
                      (click)="setDefault(assistant)"
                    >
                      {{ 'XP.XProject.SetAsDefault' | translate }}
                    </button>
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'XP.XProject.RemoveXpert' | translate"
                      (click)="remove(assistant)"
                    >
                      <i class="ri-delete-bin-line text-text-destructive"></i>
                    </button>
                  }
                </div>
              </div>
            } @empty {
              <p class="p-5 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectExperts' | translate }}</p>
            }
          </div>
        </section>

        <section class="space-y-3 border-t border-divider-subtle pt-4">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">{{ 'XP.XProject.AddProjectExpert' | translate }}</h3>
            <p class="mt-1 text-xs text-text-secondary">{{ 'XP.XProject.AddProjectExpertDescription' | translate }}</p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <z-select
              class="min-w-0 flex-1"
              [zValue]="selectedId()"
              [zDisabled]="busy() || !availableCandidates().length"
              [zPlaceholder]="'XP.XProject.SelectXpert' | translate"
              (zSelectionChange)="select($event)"
            >
              <z-select-item zValue="">{{ 'XP.XProject.SelectXpert' | translate }}</z-select-item>
              @for (assistant of availableCandidates(); track assistant.id) {
                <z-select-item [zValue]="assistant.id">{{ assistant.title || assistant.name }}</z-select-item>
              }
            </z-select>
            <button
              z-button
              zType="default"
              zSize="default"
              type="button"
              [disabled]="!selectedId() || busy()"
              (click)="add()"
            >
              <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddExpert' | translate }}
            </button>
          </div>
          @if (!availableCandidates().length) {
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.NoAvailableXperts' | translate }}</p>
          }
        </section>
      </div>

      <footer class="flex justify-end border-t border-divider-subtle pt-4">
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.XProject.Done' | translate }}
        </button>
      </footer>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectAssistantsDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectAssistantsDialogComponent, boolean>>(ZardDialogRef)
  readonly #api = inject(XpertProjectApiService)
  readonly data = inject<XpertProjectAssistantsDialogData>(Z_MODAL_DATA)
  readonly members = signal<IXpert[]>([...(this.data.project.xperts ?? [])])
  readonly selectedId = signal('')
  readonly defaultId = signal(this.data.project.settings?.projectAssistantId ?? this.data.project.xperts?.[0]?.id ?? '')
  readonly busy = signal(false)
  readonly availableCandidates = computed(() => {
    const memberIds = new Set(this.members().map((item) => item.id))
    return this.data.workspaceXperts.filter((item) => !memberIds.has(item.id))
  })
  readonly defaultAssistant = computed(() => this.members().find((item) => item.id === this.defaultId()) ?? null)

  isDefault(id: string) {
    return id === this.defaultId()
  }

  select(value: string | number | Array<string | number>) {
    const selected = Array.isArray(value) ? value[0] : value
    this.selectedId.set(selected == null ? '' : String(selected))
  }

  async add() {
    const projectId = this.data.project.id
    const assistant = this.data.workspaceXperts.find((item) => item.id === this.selectedId())
    if (!assistant || !projectId) return
    this.busy.set(true)
    try {
      await firstValueFrom(this.#api.addXpert(projectId, assistant.id))
      this.members.update((items) => [...items, assistant])
      this.selectedId.set('')
    } finally {
      this.busy.set(false)
    }
  }

  async setDefault(assistant: IXpert) {
    if (!assistant.id || assistant.id === this.defaultId()) return
    this.busy.set(true)
    try {
      await firstValueFrom(this.#api.setAssistant(this.data.project.id, assistant.id))
      this.defaultId.set(assistant.id)
    } finally {
      this.busy.set(false)
    }
  }

  async remove(assistant: IXpert) {
    if (!assistant.id || this.isDefault(assistant.id)) return
    this.busy.set(true)
    try {
      await firstValueFrom(this.#api.removeXpert(this.data.project.id, assistant.id))
      this.members.update((items) => items.filter((item) => item.id !== assistant.id))
    } finally {
      this.busy.set(false)
    }
  }

  close() {
    this.#dialogRef.close(true)
  }
}
