import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { XP_API_BASE_URL } from '../auth.options'

interface OidcConsentDetails {
  clientId: string
  clientName: string
  scopes: string[]
  resources: string[]
}

@Component({
  standalone: false,
  selector: 'xp-oidc-consent',
  templateUrl: './consent.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OidcConsentComponent implements OnInit {
  readonly #apiBaseUrl = inject(XP_API_BASE_URL).replace(/\/$/, '')
  readonly #http = inject(HttpClient)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #route = inject(ActivatedRoute)
  readonly #queryParams = this.#route.snapshot.queryParamMap

  readonly interaction = this.#queryParams.get('interaction')?.trim() || ''
  clientId = ''
  clientName = ''
  scopes: string[] = []
  resources: string[] = []

  loading = true
  loadFailed = false
  submitting = false

  async ngOnInit(): Promise<void> {
    if (!this.interaction) {
      this.loading = false
      this.loadFailed = true
      return
    }

    try {
      const details = await firstValueFrom(
        this.#http.get<OidcConsentDetails>(
          `${this.#apiBaseUrl}/oidc/interaction/${encodeURIComponent(this.interaction)}/consent`,
          { withCredentials: true }
        )
      )
      this.clientId = details.clientId
      this.clientName = details.clientName || details.clientId
      this.scopes = details.scopes
      this.resources = details.resources
    } catch {
      this.loadFailed = true
    } finally {
      this.loading = false
      this.#cdr.markForCheck()
    }
  }

  allow(): void {
    this.submitDecision('allow')
  }

  deny(): void {
    this.submitDecision('deny')
  }

  private submitDecision(decision: 'allow' | 'deny'): void {
    if (!this.interaction || this.loading || this.loadFailed || this.submitting) {
      return
    }

    this.submitting = true
    const form = document.createElement('form')
    form.method = 'post'
    form.action = `${this.#apiBaseUrl}/oidc/interaction/${encodeURIComponent(this.interaction)}/consent`
    form.style.display = 'none'

    const decisionInput = document.createElement('input')
    decisionInput.type = 'hidden'
    decisionInput.name = 'decision'
    decisionInput.value = decision
    form.appendChild(decisionInput)

    document.body.appendChild(form)
    form.submit()
  }
}
