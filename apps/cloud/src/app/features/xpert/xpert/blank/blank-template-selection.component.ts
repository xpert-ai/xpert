import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IconDefinition, TAvatar } from '../../../../@core'
import { EmojiAvatarComponent, IconComponent } from 'apps/cloud/src/app/@shared/avatar'

export type BlankTemplateChoice = {
  id: string
  name: string
  title?: string | null
  description?: string | null
  category?: string | null
  avatar?: TAvatar | null
  icon?: IconDefinition | null
}

@Component({
  selector: 'xpert-blank-template-selection',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, EmojiAvatarComponent, IconComponent],
  template: `
    <div class="space-y-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm transition-colors"
            [class.border-primary-500]="category() === 'all'"
            [class.bg-background-default]="category() === 'all'"
            [class.text-text-primary]="category() === 'all'"
            [class.border-components-panel-border]="category() !== 'all'"
            [class.text-text-secondary]="category() !== 'all'"
            (click)="category.set('all')"
          >
            {{ 'PAC.KEY_WORDS.All' | translate: { Default: 'All' } }}
          </button>

          @for (item of categories(); track item) {
            <button
              type="button"
              class="rounded-lg border px-3 py-1.5 text-sm transition-colors"
              [class.border-primary-500]="category() === item"
              [class.bg-background-default]="category() === item"
              [class.text-text-primary]="category() === item"
              [class.border-components-panel-border]="category() !== item"
              [class.text-text-secondary]="category() !== item"
              (click)="category.set(item)"
            >
              {{ item }}
            </button>
          }
        </div>

        <label class="relative block w-full lg:max-w-64">
          <i
            class="ri-search-2-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          ></i>
          <input
            [(ngModel)]="search"
            class="w-full rounded-lg border border-components-input-border bg-components-input-bg-normal py-2 pl-9 pr-9 text-sm text-components-input-text-filled outline-none transition-colors placeholder:text-components-input-text-placeholder focus:border-components-input-border-active"
            [placeholder]="'PAC.KEY_WORDS.Search' | translate: { Default: 'Search templates' }"
          />

          @if (search()) {
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary transition-opacity hover:opacity-100"
              (click)="search.set('')"
            >
              <i class="ri-close-circle-fill"></i>
            </button>
          }
        </label>
      </div>

      @if (error()) {
        <div
          class="rounded-xl border border-components-panel-border bg-background-default px-4 py-3 text-sm text-text-destructive"
        >
          {{ error() }}
        </div>
      } @else if (loading()) {
        <div
          class="rounded-xl border border-dashed border-components-panel-border px-4 py-6 text-sm text-text-secondary"
        >
          {{ 'PAC.Xpert.LoadingTemplates' | translate: { Default: 'Loading templates...' } }}
        </div>
      } @else if (!filteredTemplates().length) {
        <div
          class="rounded-xl border border-dashed border-components-panel-border px-4 py-6 text-sm text-text-secondary"
        >
          {{ emptyKey() | translate: { Default: emptyDefault() } }}
        </div>
      } @else {
        <div class="grid gap-3 lg:grid-cols-2">
          @for (template of filteredTemplates(); track template.id) {
            <button
              type="button"
              class="group rounded-xl border bg-components-card-bg p-4 text-left transition-all"
              [class.border-primary-500]="selectedId() === template.id"
              [class.shadow-sm]="selectedId() !== template.id"
              [class.border-components-panel-border]="selectedId() !== template.id"
              [class.bg-background-default]="selectedId() === template.id"
              (click)="selectedId.set(template.id)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-components-panel-border bg-background-default-subtle"
                >
                  @if (template.avatar) {
                    <emoji-avatar [avatar]="template.avatar" class="block h-full w-full overflow-hidden rounded-xl" />
                  } @else if (template.icon) {
                    <xp-icon [icon]="template.icon" [size]="28" />
                  } @else {
                    <i class="ri-layout-grid-fill text-lg text-text-secondary"></i>
                  }
                </div>

                <div class="min-w-0 flex-1">
                  <div class="truncate text-base font-semibold text-text-primary">
                    {{ template.title || template.name }}
                  </div>
                  <div class="mt-1 text-xs uppercase tracking-[0.18em] text-text-tertiary">
                    {{ template.category || ('PAC.Xpert.Template' | translate: { Default: 'Template' }) }}
                  </div>
                </div>

                @if (selectedId() === template.id) {
                  <div class="rounded-full border border-primary-500 px-2 py-0.5 text-xs font-medium text-primary-500">
                    {{ 'PAC.KEY_WORDS.Selected' | translate: { Default: 'Selected' } }}
                  </div>
                }
              </div>

              <div class="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">
                {{
                  template.description ||
                    ('PAC.Xpert.NoTemplateDescription' | translate: { Default: 'No description yet.' })
                }}
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlankTemplateSelectionComponent {
  readonly templates = input<BlankTemplateChoice[]>([])
  readonly loading = input(false)
  readonly error = input<string | null>(null)
  readonly emptyKey = input('PAC.Xpert.NoTemplatesFound')
  readonly emptyDefault = input('No templates found')
  readonly selectedId = model<string | null>(null)
  readonly category = model('all')
  readonly search = model('')

  readonly categories = computed(() =>
    Array.from(
      new Set(
        this.templates()
          .map((template) => template.category?.trim())
          .filter((value): value is string => !!value)
      )
    )
  )

  readonly filteredTemplates = computed(() => {
    const category = this.category()
    const search = this.search().trim().toLowerCase()

    return this.templates().filter((template) => {
      if (category !== 'all' && template.category !== category) {
        return false
      }

      if (!search) {
        return true
      }

      return [template.title, template.name, template.description]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(search))
    })
  })
}
