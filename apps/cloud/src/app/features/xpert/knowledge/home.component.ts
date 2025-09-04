import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective } from '@metad/core'
import { injectConfirmDelete, injectConfirmUnique } from '@metad/ocap-angular/common'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, combineLatestWith, debounceTime, map, startWith, switchMap } from 'rxjs'
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
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { UserProfileInlineComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'xpert-workspace-knowledgebases',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MatButtonModule,
    MatIconModule,
    AppearanceDirective,
    DynamicGridDirective,
    EmojiAvatarComponent,
    UserProfileInlineComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgebaseHomeComponent {
  KnowledgebasePermission = KnowledgebasePermission

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly helpWebsite = injectHelpWebsite()
  readonly confirmUnique = injectConfirmUnique()
  readonly confirmDelete = injectConfirmDelete()
  readonly title = injectTranslate('PAC.Knowledgebase.NewKnowledgebase', { Default: `New Knowledgebase` })
  readonly information = injectTranslate('PAC.Knowledgebase.ConfirmDeleteKnowledgebase', {
    Default: `Confirm delete knowledgebase and all its contents?`
  })

  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly searchControl = new FormControl('')
  readonly knowledgebases = toSignal(
    this.refresh$.pipe(
      switchMap(() =>
        this.knowledgebaseService.getAllInOrg({ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } })
      ),
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          map((text) => text?.toLowerCase()),
          startWith('')
        )
      ),
      map(([{ items }, search]) =>
        search
          ? items.filter(
              (item) => item.name.toLowerCase().includes(search) || item.description?.toLowerCase().includes(search)
            )
          : items
      )
    )
  )

  refresh() {
    this.refresh$.next(true)
  }

  openKnowledgebase(id: string) {
    this.#router.navigate(['/xpert/knowledges', id])
  }

  newKnowledgebase() {
    this.confirmUnique(
      {
        title: this.title()
      },
      (name: string) =>
        this.knowledgebaseService.create({
          name
        })
    ).subscribe({
      next: (result) => {
        this.refresh()
        this._toastrService.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully!' })
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
    this.confirmDelete(
      {
        value: item.name,
        information: this.information()
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
