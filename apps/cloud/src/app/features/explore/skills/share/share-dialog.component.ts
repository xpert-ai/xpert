import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { firstValueFrom } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage, IShareSkillPackageInput, ISkillPackage, SkillPackageService, ToastrService } from '@cloud/app/@core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'

type ExploreSkillShareDialogData = {
  skill: ISkillPackage
  workspaceId: string
}

@Component({
  standalone: true,
  selector: 'xp-explore-skill-share-dialog',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, NgmI18nPipe, NgmSpinComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full max-w-2xl rounded-[28px] bg-components-card-bg px-6 py-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-2xl font-semibold text-text-primary">
            {{
              skill.publishAt
                ? ('PAC.Explore.RepublishSkillTitle' | translate: { Default: 'Update Skill Share' })
                : ('PAC.Explore.ShareSkillTitle' | translate: { Default: 'Share Skill to Organization Market' })
            }}
          </div>
          <p class="mt-2 text-sm leading-6 text-text-tertiary">
            {{
              'PAC.Explore.ShareSkillDialogHint'
                | translate
                  : {
                      Default:
                        'Edit the display information before publishing to the current organization market. Later workspace file changes will not sync automatically, so republish manually when needed.'
                    }
            }}
          </p>
        </div>

        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-background-default-subtle hover:text-text-primary"
          [disabled]="submitting()"
          (click)="close()"
        >
          <i class="ri-close-line text-lg"></i>
        </button>
      </div>

      <div class="mt-5 rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4">
        <div class="text-xs font-medium uppercase tracking-[0.16em] text-text-quaternary">
          {{ 'PAC.Explore.SourceSkill' | translate: { Default: 'Source Skill' } }}
        </div>
        <div class="mt-2 text-base font-semibold text-text-primary">
          {{ (skill.metadata?.displayName | i18n) || skill.name || skill.metadata?.name || '-' }}
        </div>
        <div class="mt-1 text-sm text-text-tertiary">
          {{
            (skill.metadata?.author?.name || ('PAC.Explore.AutoCreatorHint' | translate: { Default: 'Creator will be generated from the current user' }))
          }}
        </div>
      </div>

      <form class="mt-6 grid gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <label class="grid gap-2">
          <span class="text-sm font-medium text-text-primary">
            {{ 'PAC.Explore.ShareDisplayName' | translate: { Default: 'Display Name' } }}
          </span>
          <input
            type="text"
            formControlName="displayName"
            class="w-full rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </label>

        <label class="grid gap-2">
          <span class="text-sm font-medium text-text-primary">
            {{ 'PAC.Explore.ShareDescription' | translate: { Default: 'Description' } }}
          </span>
          <textarea
            rows="5"
            formControlName="description"
            class="w-full rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
          ></textarea>
        </label>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="grid gap-2">
            <span class="text-sm font-medium text-text-primary">
              {{ 'PAC.Explore.ShareVersion' | translate: { Default: 'Version' } }}
            </span>
            <input
              type="text"
              formControlName="version"
              class="w-full rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>

          <label class="grid gap-2">
            <span class="text-sm font-medium text-text-primary">
              {{ 'PAC.KEY_WORDS.License' | translate: { Default: 'License' } }}
            </span>
            <input
              type="text"
              formControlName="license"
              class="w-full rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>
        </div>

        <label class="grid gap-2">
          <span class="text-sm font-medium text-text-primary">
            {{ 'PAC.Explore.ShareTags' | translate: { Default: 'Tags' } }}
          </span>
          <input
            type="text"
            formControlName="tags"
            class="w-full rounded-xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            [placeholder]="'PAC.Explore.ShareTagsPlaceholder' | translate: { Default: 'Separate tags with commas' }"
          />
        </label>

        <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4">
          <div class="text-xs font-medium uppercase tracking-[0.16em] text-text-quaternary">
            {{ 'PAC.Explore.Creator' | translate: { Default: 'Creator' } }}
          </div>
          <div class="mt-2 text-sm font-medium text-text-primary">
            {{ creatorName }}
          </div>
          <div class="mt-1 text-xs text-text-tertiary">
            {{ 'PAC.Explore.CreatorReadonlyHint' | translate: { Default: 'Creator is filled automatically from the current user and cannot be edited here.' } }}
          </div>
        </div>

        @if (form.invalid && form.touched) {
          <div class="rounded-2xl border border-status-destructive bg-status-destructive/10 px-4 py-3 text-sm text-status-destructive">
            {{ 'PAC.Explore.ShareValidationHint' | translate: { Default: 'Please complete the display name and description first.' } }}
          </div>
        }

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" class="btn btn-secondary btn-medium" [disabled]="submitting()" (click)="close()">
            {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button type="submit" class="btn btn-primary btn-medium min-w-[132px]" [disabled]="submitting()">
            @if (submitting()) {
              <ngm-spin size="small" class="mr-1" />
              {{ 'PAC.ACTIONS.Saving' | translate: { Default: 'Saving...' } }}
            } @else {
              {{
                skill.publishAt
                  ? ('PAC.Explore.RepublishSkill' | translate: { Default: 'Update Share' })
                  : ('PAC.Explore.ShareSkill' | translate: { Default: 'Share' })
              }}
            }
          </button>
        </div>
      </form>
    </div>
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
    this.#translate.instant('PAC.Explore.AutoCreatorHint', {
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
          this.skill.publishAt ? 'PAC.Explore.RepublishSkillSuccess' : 'PAC.Explore.ShareSkillSuccess',
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
