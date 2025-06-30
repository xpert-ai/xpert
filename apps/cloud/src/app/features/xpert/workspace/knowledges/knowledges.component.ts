import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective, nonBlank } from '@metad/core'
import { injectConfirmDelete, injectConfirmUnique } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Dialog } from '@angular/cdk/dialog'
import { BehaviorSubject, filter, map, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebase,
  injectHelpWebsite,
  injectTranslate,
  KnowledgebasePermission,
  KnowledgebaseService,
  OrderTypeEnum,
  routeAnimations,
  Store,
  ToastrService
} from '../../../../@core'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'
import { CardCreateComponent } from '../../../../@shared/card'
import { UserProfileInlineComponent } from '../../../../@shared/user'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertNewKnowledgeComponent } from '../../knowledge'

@Component({
  standalone: true,
  selector: 'xpert-workspace-knowledges',
  templateUrl: './knowledges.component.html',
  styleUrls: ['./knowledges.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    AppearanceDirective,
    DensityDirective,
    DynamicGridDirective,
    EmojiAvatarComponent,
    UserProfileInlineComponent,
    CardCreateComponent
  ],
  animations: [routeAnimations]
})
export class XpertWorkspaceKnowledgesComponent {
  KnowledgebasePermission = KnowledgebasePermission

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #translate = injectTranslate('PAC.Knowledgebase')
  readonly helpWebsite = injectHelpWebsite()
  readonly confirmUnique = injectConfirmUnique()
  readonly confirmDelete = injectConfirmDelete()
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly #dialog = inject(Dialog)

  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly searchText = this.homeComponent.searchText
  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly #knowledgebases = toSignal(
    toObservable(this.workspaceId).pipe(
      filter(nonBlank),
      switchMap((workspaceId) =>
        this.refresh$.pipe(
          switchMap(() =>
            this.knowledgebaseService.getAllByWorkspace(workspaceId, {
              relations: ['createdBy'],
              order: { updatedAt: OrderTypeEnum.DESC }
            })
          )
        )
      ),
      map(({ items }) => items)
    )
  )
  readonly knowledgebases = computed(() => {
    const items = this.#knowledgebases()
    const searchText = this.searchText()
    return searchText
      ? items.filter(
          (item) => item.name.toLowerCase().includes(searchText) || item.description?.toLowerCase().includes(searchText)
        )
      : items
  })

  refresh() {
    this.refresh$.next(true)
  }

  openKnowledgebase(id: string) {
    this.#router.navigate(['/xpert/knowledges', id])
  }

  newKnowledgebase() {
    this.#dialog.open<IKnowledgebase>(XpertNewKnowledgeComponent, {
      data: {
        workspaceId: this.workspaceId()
      }
    }).closed.subscribe({
      next: (knowledgebase) => {
        if (knowledgebase) {
          this.#router.navigate(['/xpert/knowledges/', knowledgebase.id,])
        }
      }
    })
  }

  edit(item: IKnowledgebase) {
    this.#router.navigate(['/xpert/knowledges/', item.id, 'configuration'],)
  }

  remove(item: IKnowledgebase) {
    this.confirmDelete(
      {
        value: item.name,
        information:
          this.#translate()?.ConfirmDeleteKnowledgebase || `Confirm delete knowledgebase and all its contents?`
      },
      this.knowledgebaseService.delete(item.id)
    ).subscribe({
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
