import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, combineLatest, distinctUntilChanged, switchMap } from 'rxjs'
import { Store, VisitsService } from '../../../@core/services'
import { MaterialModule } from '../../../@shared/material.module'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MaterialModule,
    RouterModule,
    AppearanceDirective,
    DensityDirective
  ],
  selector: 'pac-feed-user-visit',
  templateUrl: 'user-visit.component.html',
  styleUrls: ['user-visit.component.scss']
})
export class UserVisitComponent {
  private store = inject(Store)
  private visitsService = inject(VisitsService)

  get type() {
    return this.type$.value
  }
  set type(value) {
    this.type$.next(value)
  }
  private type$ = new BehaviorSubject<'all' | 'my'>('all')

  private organizationId$ = this.store.selectOrganizationId()

  public readonly ranking$ = combineLatest([this.organizationId$, this.type$.pipe(distinctUntilChanged())]).pipe(
    switchMap(([, owner]) => this.visitsService.ranking('Story', owner))
  )
}
