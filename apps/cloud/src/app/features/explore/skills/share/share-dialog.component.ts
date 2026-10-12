import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { firstValueFrom } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage, SkillPackageService, ToastrService } from '@cloud/app/@core'
import type { IShareSkillPackageInput, ISkillPackage } from '@cloud/app/@core'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'

type ExploreSkillShareDialogData = {
  skill: ISkillPackage
  workspaceId: string
}

@Component({
  standalone: true,
  selector: 'xp-explore-skill-share-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ...XpDialogFrameImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form xpDialogLayout="wide" class="w-full max-h-[84vh]" [formGroup]="form" (ngSubmit)="submit()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{
            skill.publishAt
              ? ('XP.Explore.RepublishSkillTitle' | translate: { Default: 'Update Skill Share' })
              : ('XP.Explore.ShareSkillTitle' | translate: { Default: 'Share Skill to Organization Market' })
          }}
        </h2>
        <p xpDialogDescription>
          {{
            'XP.Explore.ShareSkillDialogHint'
              | translate
                : {
                    Default:
                      'Edit the display information before publishing to the current organization market. Later workspace file changes will not sync automatically, so republish manually when needed.'
                  }
          }}
        </p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [zDisabled]="submitting()"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        <div class="space-y-2">
          <div class="text-xs font-medium uppercase tracking-[0.16em] text-text-quaternary">
            {{ 'XP.Explore.SourceSkill' | translate: { Default: 'Source Skill' } }}
          </div>
          <div class="mt-2 text-base font-semibold text-text-primary">
            {{ (skill.metadata?.displayName | i18n) || skill.name || skill.metadata?.name || '-' }}
          </div>
          <div class="mt-1 text-sm text-text-tertiary">
            {{
              skill.metadata?.author?.name ||
                ('XP.Explore.AutoCreatorHint'
                  | translate: { Default: 'Creator will be generated from the current user' })
            }}
          </div>
        </div>

        <div class="grid gap-4">
          <label class="grid gap-2">
            <span class="text-sm font-medium text-text-primary">
              {{ 'XP.Explore.ShareDisplayName' | translate: { Default: 'Display Name' } }}
            </span>
            <input z-input type="text" formControlName="displayName" class="w-full" />
          </label>

          <label class="grid gap-2">
            <span class="text-sm font-medium text-text-primary">
              {{ 'XP.Explore.ShareDescription' | translate: { Default: 'Description' } }}
            </span>
            <textarea z-input rows="5" formControlName="description" class="w-full"></textarea>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="grid gap-2">
              <span class="text-sm font-medium text-text-primary">
                {{ 'XP.Explore.ShareVersion' | translate: { Default: 'Version' } }}
              </span>
              <input z-input type="text" formControlName="version" class="w-full" />
            </label>

            <label class="grid gap-2">
              <span class="text-sm font-medium text-text-primary">
                {{ 'XP.KEY_WORDS.License' | translate: { Default: 'License' } }}
              </span>
              <input z-input type="text" formControlName="license" class="w-full" />
            </label>
          </div>

          <label class="grid gap-2">
            <span class="text-sm font-medium text-text-primary">
              {{ 'XP.Explore.ShareTags' | translate: { Default: 'Tags' } }}
            </span>
            <input
              z-input
              type="text"
              formControlName="tags"
              class="w-full"
              [placeholder]="'XP.Explore.ShareTagsPlaceholder' | translate: { Default: 'Separate tags with commas' }"
            />
          </label>

          <div class="border-t border-border pt-4">
            <div class="text-xs font-medium uppercase tracking-[0.16em] text-text-quaternary">
              {{ 'XP.Explore.Creator' | translate: { Default: 'Creator' } }}
            </div>
            <div class="mt-2 text-sm font-medium text-text-primary">
              {{ creatorName }}
            </div>
            <div class="mt-1 text-xs text-text-tertiary">
              {{
                'XP.Explore.CreatorReadonlyHint'
                  | translate
                    : { Default: 'Creator is filled automatically from the current user and cannot be edited here.' }
              }}
            </div>
          </div>

          @if (form.invalid && form.touched) {
            <div
              class="rounded-2xl border border-status-destructive bg-status-destructive/10 px-4 py-3 text-sm text-status-destructive"
            >
              {{
                'XP.Explore.ShareValidationHint'
                  | translate: { Default: 'Please complete the display name and description first.' }
              }}
            </div>
          }
        </div>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" [zDisabled]="submitting()" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button z-button type="submit" [zLoading]="submitting()" [zDisabled]="submitting()">
          {{
            skill.publishAt
              ? ('XP.Explore.RepublishSkill' | translate: { Default: 'Update Share' })
              : ('XP.Explore.ShareSkill' | translate: { Default: 'Share' })
          }}
        </button>
      </footer>
    </form>
  `
})
export class ExploreSkillShareDialogComponent {
  readonly #dialogRef = inject(DialogRef<ISkillPackage | null>)
  readonly #data = inject<ExploreSkillShareDialogData>(DIALOG_DATA)
  readonly #formBuilder = inject(FormBuilder)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly skill = this.#data.skill
  readonly workspaceId = this.#data.workspaceId
  readonly submitting = signal(false)
  readonly creatorName =
    this.skill.metadata?.author?.name ||
    this.#translate.instant('XP.Explore.AutoCreatorHint', {
      Default: 'Creator will be generated from the current user'
    })

  readonly form = this.#formBuilder.nonNullable.group({
    displayName: [
      readI18nText(this.skill.metadata?.displayName) || this.skill.name || this.skill.metadata?.name || '',
      Validators.required
    ],
    description: [readI18nText(this.skill.metadata?.description) || '', Validators.required],
    version: [this.skill.metadata?.version || ''],
    license: [this.skill.metadata?.license || ''],
    tags: [(this.skill.metadata?.tags ?? []).join(', ')]
  })

  async submit() {
    if (!this.skill.id) {
      return
    }

    this.form.markAllAsTouched()
    if (this.form.invalid || this.submitting()) {
      return
    }

    this.submitting.set(true)
    try {
      const value = this.form.getRawValue()
      const payload: IShareSkillPackageInput = {
        displayName: value.displayName.trim(),
        description: value.description.trim(),
        version: value.version.trim() || undefined,
        license: value.license.trim() || undefined,
        tags: value.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      }
      const sharedSkill = await firstValueFrom(
        this.#skillPackageService.sharePackage(this.workspaceId, this.skill.id, payload)
      )

      this.#toastr.success(
        this.#translate.instant(
          this.skill.publishAt ? 'XP.Explore.RepublishSkillSuccess' : 'XP.Explore.ShareSkillSuccess',
          {
            Default: this.skill.publishAt ? 'Skill share updated successfully' : 'Skill shared successfully'
          }
        )
      )
      this.#dialogRef.close(sharedSkill)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  close() {
    this.#dialogRef.close(null)
  }
}

function readI18nText(value?: string | { en_US?: string; zh_Hans?: string } | null): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return value.en_US || value.zh_Hans || ''
}
