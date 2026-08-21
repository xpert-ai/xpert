import { CommonModule } from '@angular/common'
import { Component, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IXpert } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { XpertAPIService } from '../../@core/services/xpert.service'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-config',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardDividerComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardFormImports,
    ...ZardCardImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-4 sm:p-6">
      <header class="flex flex-col gap-2 border-b border-divider-subtle pb-5">
        <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {{ 'XP.XProject.Governance' | translate }}
        </p>
        <h2 class="text-xl font-semibold text-text-primary">{{ 'XP.XProject.ProjectConfiguration' | translate }}</h2>
        <p class="max-w-3xl text-sm leading-6 text-text-secondary">
          {{ 'XP.XProject.ConfigurationDescription' | translate }}
        </p>
      </header>

      <section class="flex flex-col gap-4 pt-1" aria-labelledby="assistant-config-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="assistant-config-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectAssistant' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectAssistantDescription' | translate }}</p>
          </div>
          <a
            z-button
            zType="ghost"
            zSize="sm"
            [routerLink]="['/project', facade.project()?.id]"
            [queryParams]="{ chat: 'open' }"
            queryParamsHandling="merge"
            ><i class="ri-chat-3-line mr-1"></i>{{ 'XP.XProject.OpenAssistantPanel' | translate }}</a
          >
        </div>
        <z-divider></z-divider>
        <z-card class="border border-divider-regular bg-components-card-bg shadow-none"
          ><z-card-content class="p-4"
            ><div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                  ><i class="ri-sparkling-2-line"></i
                ></span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-text-primary">
                    {{ facade.project()?.xperts?.[0]?.name || ('XP.XProject.ProjectAssistantDefault' | translate) }}
                  </p>
                  <p class="mt-1 truncate text-xs text-text-secondary">
                    {{ 'XP.XProject.ProjectAssistantRole' | translate }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <z-badge zType="secondary">{{
                      facade.project()?.copilotModel?.model || ('XP.XProject.ProjectDefaultModel' | translate)
                    }}</z-badge
                    ><z-badge zType="outline">{{ 'XP.XProject.DefaultXpert' | translate }}</z-badge>
                  </div>
                </div>
              </div>
              <a
                z-button
                zType="outline"
                zSize="sm"
                [routerLink]="['/project', facade.project()?.id]"
                [queryParams]="{ chat: 'open' }"
                queryParamsHandling="merge"
                >{{ 'XP.XProject.ValidateInAssistant' | translate }}<i class="ri-arrow-right-up-line ml-1"></i
              ></a></div></z-card-content
        ></z-card>
        <div class="flex flex-col gap-3 border-y border-divider-subtle py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-text-primary">{{ 'XP.XProject.ProjectAssistantBinding' | translate }}</p>
            <p class="mt-1 text-xs text-text-secondary">
              {{ 'XP.XProject.ProjectAssistantBindingDescription' | translate }}
            </p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <z-select
              class="min-w-0 flex-1"
              [zValue]="selectedXpertId()"
              [zDisabled]="xpertsLoading() || bindingXpert()"
              [zPlaceholder]="'XP.XProject.SelectXpert' | translate"
              (zSelectionChange)="selectXpert($event)"
            >
              @for (xpert of availableXperts(); track xpert.id) {
                <z-select-item [zValue]="xpert.id"
                  >{{ xpert.name }}<span class="ml-2 text-xs text-text-tertiary">{{ xpert.slug }}</span></z-select-item
                >
              }</z-select
            ><button
              z-button
              zType="outline"
              zSize="sm"
              type="button"
              [disabled]="!selectedXpertId() || bindingXpert()"
              (click)="bindSelectedXpert()"
            >
              {{ (bindingXpert() ? 'XP.XProject.BindingXpert' : 'XP.XProject.BindXpert') | translate }}
            </button>
          </div>
          @if (xpertsLoading()) {
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.LoadingXperts' | translate }}</p>
          }
          @if (!xpertsLoading() && !availableXperts().length) {
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.NoAvailableXperts' | translate }}</p>
          }
        </div>
      </section>

      <section class="flex flex-col gap-4 pt-1" aria-labelledby="instruction-title">
        <div>
          <h3 id="instruction-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.ProjectInstructions' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectInstructionDescription' | translate }}</p>
        </div>
        <z-divider></z-divider>
        <z-form-field class="w-full"
          ><z-form-label>{{ 'XP.XProject.SystemGuidance' | translate }}</z-form-label
          ><textarea
            z-input
            class="min-h-36 resize-y"
            [value]="instruction()"
            (input)="instruction.set($any($event.target).value)"
            [placeholder]="'XP.XProject.GuidancePlaceholder' | translate"
          ></textarea>
        </z-form-field>
        <div>
          <button z-button zType="default" zSize="sm" type="button" [disabled]="saving()" (click)="saveInstructions()">
            {{ (saving() ? 'XP.XProject.Saving' : 'XP.XProject.SaveInstructions') | translate }}
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-4 pt-1" aria-labelledby="resources-title">
        <div>
          <h3 id="resources-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.DefaultResources' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.DefaultResourcesDescription' | translate }}</p>
        </div>
        <z-divider></z-divider>
        <div class="divide-y divide-divider-subtle border-y border-divider-subtle">
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-sparkling-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.XpertsLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.xperts?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-tools-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.ToolsetsLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.toolsets?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-book-2-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.KnowledgeBasesLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.knowledges?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-team-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.MembersLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.members?.length || 0 }}</z-badge>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-4 pt-1" aria-labelledby="override-title">
        <div>
          <h3 id="override-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.SessionOverridePolicy' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.SessionOverrideDescription' | translate }}</p>
        </div>
        <z-divider></z-divider>
        <div class="divide-y divide-divider-subtle border-y border-divider-subtle">
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-text-primary">
                {{ 'XP.XProject.AllowAssistantSuggestions' | translate }}
              </p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{ 'XP.XProject.AllowAssistantSuggestionsDesc' | translate }}
              </p>
            </div>
            <z-switch [ngModel]="allowSuggestions()" (ngModelChange)="allowSuggestions.set($event)"></z-switch>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-text-primary">
                {{ 'XP.XProject.AutoReferenceProjectAssets' | translate }}
              </p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{ 'XP.XProject.AutoReferenceProjectAssetsDesc' | translate }}
              </p>
            </div>
            <z-switch [ngModel]="autoReferenceAssets()" (ngModelChange)="autoReferenceAssets.set($event)"></z-switch>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-4 pt-1" aria-labelledby="automation-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="automation-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.Automations' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.AutomationDescription' | translate }}</p>
          </div>
          <button z-button zType="outline" zSize="sm" type="button" (click)="addAutomation()">
            <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddAutomation' | translate }}
          </button>
        </div>
        <z-divider></z-divider>
        <div class="divide-y divide-divider-subtle border-y border-divider-subtle">
          @for (automation of facade.automations(); track automation.id) {
            <div class="flex items-center justify-between gap-3 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-text-primary">{{ automation.name }}</p>
                <p class="text-xs text-text-tertiary">
                  {{ automation.trigger.type }} ·
                  {{ 'XP.XProject.ActionsCount' | translate: { count: automation.actions.length } }}
                </p>
              </div>
              <z-switch
                [ngModel]="automation.enabled"
                (ngModelChange)="toggleAutomation(automation.id, $event)"
              ></z-switch>
            </div>
          } @empty {
            <p class="py-8 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoAutomations' | translate }}</p>
          }
        </div>
      </section>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectConfigComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly instruction = signal('')
  readonly saving = signal(false)
  readonly allowSuggestions = signal(true)
  readonly autoReferenceAssets = signal(true)
  readonly availableXperts = signal<IXpert[]>([])
  readonly selectedXpertId = signal('')
  readonly xpertsLoading = signal(false)
  readonly bindingXpert = signal(false)
  readonly #xpertService = inject(XpertAPIService)

  constructor() {
    effect(
      () => {
        const value = this.facade.project()?.settings?.instruction
        if (value !== undefined && !this.saving()) this.instruction.set(value)
        const xpertId = this.facade.project()?.xperts?.[0]?.id ?? ''
        if (!this.bindingXpert()) this.selectedXpertId.set(xpertId)
      },
      { allowSignalWrites: true }
    )
    void this.loadXperts()
  }

  async loadXperts() {
    this.xpertsLoading.set(true)
    try {
      const response = await firstValueFrom(this.#xpertService.getMyAll({ where: { latest: true }, take: 100 }))
      this.availableXperts.set(response.items ?? [])
    } finally {
      this.xpertsLoading.set(false)
    }
  }

  selectXpert(value: string | number | Array<string | number>) {
    const selected = Array.isArray(value) ? value[0] : value
    this.selectedXpertId.set(selected == null ? '' : String(selected))
  }

  async bindSelectedXpert() {
    const xpertId = this.selectedXpertId()
    if (!xpertId) return
    this.bindingXpert.set(true)
    try {
      await this.facade.bindXpert(xpertId)
    } finally {
      this.bindingXpert.set(false)
    }
  }

  async saveInstructions() {
    this.saving.set(true)
    try {
      await this.facade.updateProject({
        settings: { ...(this.facade.project()?.settings ?? {}), instruction: this.instruction() }
      })
    } finally {
      this.saving.set(false)
    }
  }

  async addAutomation() {
    await this.facade.createAutomation({
      name: 'New automation',
      enabled: false,
      trigger: { type: 'task.status_changed' },
      actions: []
    })
  }

  async toggleAutomation(id: string, enabled: boolean) {
    await this.facade.updateAutomation(id, { enabled })
  }
}
