import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { injectConfirmDelete, injectConfirmUnique } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY, map, switchMap } from 'rxjs'
import { CdkMenuModule } from '@angular/cdk/menu'
import {
  getErrorMessage,
  IKnowledgebase,
  injectHelpWebsite,
  KnowledgebasePermission,
  KnowledgebaseService,
  OrderTypeEnum,
  routeAnimations,
  Store,
  ToastrService
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { DynamicGridDirective } from '@metad/core'
import { CardCreateComponent } from '../../../@shared/card'
import { TranslationBaseComponent } from '../../../@shared/language'
import { UserProfileInlineComponent } from '../../../@shared/user'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'

@Component({
  standalone: true,
  selector: 'pac-settings-knowledgebases',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MatButtonModule,
    MatIconModule,
    AppearanceDirective,
    DensityDirective,
    DynamicGridDirective,
    EmojiAvatarComponent,
    UserProfileInlineComponent,
    CardCreateComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgebaseHomeComponent extends TranslationBaseComponent {
  KnowledgebasePermission = KnowledgebasePermission

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly helpWebsite = injectHelpWebsite()
  readonly confirmUnique = injectConfirmUnique()
  readonly confirmDelete = injectConfirmDelete()

  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly knowledgebases = toSignal(
    this.refresh$.pipe(
      switchMap(() =>
        this.knowledgebaseService.getAllInOrg({ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } })
      ),
      map(({ items }) => items)
    )
  )

  refresh() {
    this.refresh$.next(true)
  }

  openKnowledgebase(id: string) {
    this.#router.navigate([id], { relativeTo: this.#route })
  }

  newKnowledgebase() {
    this.confirmUnique({
      title: this.translateService.instant('PAC.Knowledgebase.NewKnowledgebase', {
        Default: `New Knowledgebase`
      })
    }, (name: string) => this.knowledgebaseService.create({
      name
    }))
      .subscribe({
        next: (result) => {
          this.refresh()
          this._toastrService.success('PAC.Messages.CreatedSuccessfully', {Default: 'Created successfully!'})
        },
        error: (error) => {
          this._toastrService.error(error, 'Error')
        }
      })
  }

  edit(item: IKnowledgebase) {
    this.#router.navigate([item.id, 'configuration'], { relativeTo: this.#route })
  }

  remove(item: IKnowledgebase) {
    this.confirmDelete({
      value: item.name,
      information: this.translateService.instant('PAC.Knowledgebase.ConfirmDeleteKnowledgebase', {
        Default: `Confirm delete knowledgebase and all its contents?`
      })
    }, this.knowledgebaseService.delete(item.id))
      .subscribe({
        next: () => {
          this.refresh()
          this._toastrService.success('PAC.Messages.DeletedSuccessfully', 'Deleted Successfully')
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error), 'Error')
        }
      })
  }
}
