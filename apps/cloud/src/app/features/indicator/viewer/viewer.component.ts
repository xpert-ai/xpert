import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { IndicatorsService } from '@metad/cloud/state'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { formatRelative } from 'date-fns'
import { isNil, negate } from 'lodash-es'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { AbilityActions, getDateLocale } from '../../../@core'
import { IndicatorTypeComponent } from '../../../@shared/indicator'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { MaterialModule } from '../../../@shared/material.module'
import { TagViewerComponent } from '../../../@shared/tag'
import { CreatedByPipe } from '../../../@shared/pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MaterialModule,
    TranslateModule,

    CreatedByPipe,
    NgmSelectionModule,
    IndicatorTypeComponent,
    TagViewerComponent
  ],
  selector: 'pac-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss']
})
export class ViewerComponent {
  AbilityActions = AbilityActions
  public readonly translateService = inject(TranslateService)
  private indicatorsService = inject(IndicatorsService)
  private _route = inject(ActivatedRoute)
  private _router = inject(Router)

  public readonly indicator = toSignal(
    this._route.paramMap.pipe(
      startWith(this._route.snapshot.paramMap),
      map((paramMap) => paramMap.get('id')),
      filter(negate(isNil)),
      distinctUntilChanged(),
      switchMap((id) => this.indicatorsService.getById(id, ['model', 'businessArea', 'createdBy', 'certification'])),
      map(
        (indicator) =>
          ({
            ...indicator,
            validity: formatRelative(new Date(indicator.validity), new Date(), {
              locale: getDateLocale(this.translateService.currentLang)
            })
          } as any)
      )
    )
  )

  edit(id: string) {
    this._router.navigate(['../../edit/', id], { relativeTo: this._route })
  }

  delete(id: string) {
    this.indicatorsService.delete(id)
  }
}
