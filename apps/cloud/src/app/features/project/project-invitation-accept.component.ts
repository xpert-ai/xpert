import { Component, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IXpertProjectMembership } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ScopeService } from '../../@core'
import { CurrentUserHydrationService } from '../../@core/state'
import { XpertProjectApiService } from './project-api.service'

@Component({
  standalone: true,
  selector: 'xp-project-invitation-accept',
  imports: [TranslateModule, ZardButtonComponent],
  template: `
    <main class="flex min-h-[60vh] items-center justify-center p-6">
      <section class="w-full max-w-lg rounded-2xl border border-divider-subtle bg-components-card-bg p-6 shadow-sm">
        <div class="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <i class="ri-team-line text-xl"></i>
        </div>
        <h1 class="mt-4 text-xl font-semibold text-text-primary">
          {{ 'XP.XProject.ProjectInvitationTitle' | translate }}
        </h1>
        <p class="mt-2 text-sm leading-6 text-text-secondary">
          {{ 'XP.XProject.ProjectInvitationDescription' | translate }}
        </p>

        @if (!token) {
          <p
            class="mt-4 rounded-lg border border-divider-subtle bg-background-default-subtle p-3 text-sm text-text-secondary"
          >
            {{ 'XP.XProject.InvalidProjectInvitation' | translate }}
          </p>
        }
        @if (acceptedMembership()) {
          <p
            class="mt-4 rounded-lg border border-divider-subtle bg-background-default-subtle p-3 text-sm text-text-secondary"
          >
            {{ 'XP.XProject.ProjectInvitationAccepted' | translate }}
          </p>
        }
        @if (error()) {
          <p
            class="mt-4 rounded-lg border border-divider-subtle bg-background-default-subtle p-3 text-sm text-text-secondary"
          >
            {{ error() }}
          </p>
        }

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          @if (!acceptedMembership()) {
            <button z-button zType="ghost" type="button" [disabled]="busy()" (click)="decline()">
              {{ 'XP.XProject.DeclineInvitation' | translate }}
            </button>
          }
          <button
            z-button
            zType="default"
            type="button"
            [disabled]="busy() || !token"
            (click)="acceptedMembership() ? continueToProject() : accept()"
          >
            {{
              (busy()
                ? acceptedMembership()
                  ? 'XP.XProject.OpeningProject'
                  : 'XP.XProject.AcceptingInvitation'
                : acceptedMembership()
                  ? 'XP.XProject.ContinueToProject'
                  : 'XP.XProject.AcceptInvitation'
              ) | translate
            }}
          </button>
        </div>
      </section>
    </main>
  `,
  host: { class: 'block w-full' }
})
export class XpertProjectInvitationAcceptComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #api = inject(XpertProjectApiService)
  readonly #currentUserHydration = inject(CurrentUserHydrationService)
  readonly #scopeService = inject(ScopeService)
  readonly #translate = inject(TranslateService)
  readonly token = this.#route.snapshot.queryParamMap.get('token')?.trim() ?? ''
  readonly busy = signal(false)
  readonly error = signal('')
  readonly acceptedMembership = signal<IXpertProjectMembership | null>(null)

  async accept() {
    if (!this.token || this.busy()) return
    this.busy.set(true)
    this.error.set('')
    try {
      const membership = await firstValueFrom(this.#api.acceptInvitation(this.token))
      this.acceptedMembership.set(membership)
      await this.openProject(membership)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async continueToProject() {
    const membership = this.acceptedMembership()
    if (!membership || this.busy()) return
    this.busy.set(true)
    this.error.set('')
    try {
      await this.openProject(membership)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async decline() {
    if (!this.token || this.busy()) {
      await this.#router.navigate(['/project'])
      return
    }
    this.busy.set(true)
    this.error.set('')
    try {
      await firstValueFrom(this.#api.declineInvitation(this.token))
      await this.#router.navigate(['/project'])
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  private async openProject(membership: IXpertProjectMembership) {
    const currentUser = await this.#currentUserHydration.getFeatureHydration({ force: true, skipSessionCache: true })
    const organization = currentUser?.organizations?.find(
      (item) => item.organizationId === membership.organizationId
    )?.organization
    if (!organization) {
      throw new Error(
        this.#translate.instant('XP.XProject.ProjectInvitationOrganizationUnavailable', {
          Default: 'The Project Organization could not be loaded after accepting the invitation.'
        })
      )
    }
    await this.#scopeService.switchToOrganization(organization)
    await this.#router.navigate(['/project', membership.projectId])
  }
}
