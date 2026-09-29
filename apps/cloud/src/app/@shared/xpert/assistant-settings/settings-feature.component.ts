import { ChangeDetectionStrategy, Component, input, model } from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardAccordionImports, ZardSwitchComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-settings-feature',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, NgTemplateOutlet, ZardSwitchComponent, ...ZardAccordionImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block [&:first-child>section]:pt-0' },
  template: `
    <section class="border-b border-divider-regular py-2">
      @if (collapsible()) {
        <z-accordion class="relative" displayMode="flat">
          <z-accordion-item
            class="[&_[data-slot=accordion-body]>div]:p-0"
            [expanded]="expanded()"
            (expandedChange)="expanded.set($event)"
          >
            <z-accordion-header
              class="min-h-10 cursor-pointer items-start rounded-lg px-0 py-0 pr-16 [&>[data-slot=accordion-chevron]]:mt-1.5"
            >
              <ng-container [ngTemplateOutlet]="heading" />
            </z-accordion-header>
            <ng-template zAccordionContent>
              <div
                class="mt-2 space-y-3"
                [attr.inert]="expanded() ? null : ''"
                [attr.aria-hidden]="expanded() ? null : 'true'"
              >
                <ng-container [ngTemplateOutlet]="details" />
              </div>
            </ng-template>
          </z-accordion-item>
          <z-switch class="absolute right-0 top-1" [formControl]="control()">
            <span class="sr-only">{{ titleKey() | translate }}</span>
          </z-switch>
        </z-accordion>
      } @else {
        <div class="flex items-start justify-between gap-3">
          <ng-container [ngTemplateOutlet]="heading" />
          <z-switch class="mt-1 shrink-0" [formControl]="control()">
            <span class="sr-only">{{ titleKey() | translate }}</span>
          </z-switch>
        </div>
        @if (expanded()) {
          <div class="mt-2 space-y-3"><ng-container [ngTemplateOutlet]="details" /></div>
        }
      }
    </section>
    <ng-template #heading>
      <div class="min-w-0 flex-1">
        <h3 class="text-lg font-semibold text-text-primary">{{ titleKey() | translate }}</h3>
        @if (description()) {
          <p class="mt-1 text-sm leading-5 text-text-tertiary">{{ description() | translate }}</p>
        }
      </div>
    </ng-template>
    <ng-template #details><ng-content /></ng-template>
  `
})
export class SettingsFeatureComponent {
  readonly titleKey = input.required<string>()
  readonly description = input<string>()
  readonly control = input.required<FormControl<boolean>>()
  readonly collapsible = input(true)
  readonly expanded = model(true)
}
