import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  BUSINESS_AREA_ACCESS_ROLES,
  type IBusinessAreaAccess,
  type IBusinessAreaAccessGrant,
  type IBusinessAreaGrantCandidates,
  type TBusinessAreaRole
} from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { BusinessAreaService, getErrorMessage, injectToastr } from '../../../@core'

@Component({
  selector: 'xp-business-area-access',
  standalone: true,
  imports: [FormsModule, TranslateModule, ZardButtonComponent],
  templateUrl: './business-area-access.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessAreaAccessComponent {
  readonly areaId = input.required<string>()
  readonly api = inject(BusinessAreaService)
  readonly toastr = injectToastr()
  readonly roles = BUSINESS_AREA_ACCESS_ROLES
  readonly grants = signal<IBusinessAreaAccessGrant[]>([])
  readonly candidates = signal<IBusinessAreaGrantCandidates>({ users: [], groups: [] })
  readonly access = signal<IBusinessAreaAccess | null>(null)
  readonly explanation = signal<IBusinessAreaAccess | null>(null)
  readonly busy = signal(false)
  readonly error = signal('')
  subjectType: 'user' | 'user_group' = 'user_group'
  subjectId = ''
  role: TBusinessAreaRole = 'consumer'
  inspectedUserId = ''

  constructor() {
    effect(() => {
      const id = this.areaId()
      void this.load(id)
    })
  }

  async load(id = this.areaId()) {
    this.busy.set(true)
    this.error.set('')
    this.access.set(null)
    this.explanation.set(null)
    this.inspectedUserId = ''
    this.subjectId = ''
    this.grants.set([])
    this.candidates.set({ users: [], groups: [] })
    try {
      const access = await firstValueFrom(this.api.access(id))
      if (id !== this.areaId()) return
      this.access.set(access)
      if (access.canManage) {
        const [grants, candidates] = await Promise.all([
          firstValueFrom(this.api.grants(id)),
          firstValueFrom(this.api.grantCandidates(id))
        ])
        if (id !== this.areaId()) return
        this.grants.set(grants)
        this.candidates.set(candidates)
      }
    } catch (error) {
      if (id === this.areaId()) this.error.set(getErrorMessage(error))
    } finally {
      if (id === this.areaId()) this.busy.set(false)
    }
  }

  async save() {
    if (!this.subjectId || this.busy()) return
    this.busy.set(true)
    try {
      await firstValueFrom(
        this.api.grant(
          this.areaId(),
          this.subjectType === 'user'
            ? { subjectType: 'user', userId: this.subjectId, role: this.role }
            : { subjectType: 'user_group', userGroupId: this.subjectId, role: this.role }
        )
      )
      this.subjectId = ''
      await this.load()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async revoke(grant: IBusinessAreaAccessGrant) {
    this.busy.set(true)
    try {
      await firstValueFrom(this.api.revoke(this.areaId(), grant.id))
      await this.load()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async explain() {
    const areaId = this.areaId()
    const userId = this.inspectedUserId
    this.explanation.set(null)
    if (!userId) return
    try {
      const result = await firstValueFrom(this.api.access(areaId, userId))
      if (areaId === this.areaId() && userId === this.inspectedUserId) this.explanation.set(result)
    } catch (error) {
      if (areaId === this.areaId() && userId === this.inspectedUserId) this.toastr.error(getErrorMessage(error))
    }
  }
}
