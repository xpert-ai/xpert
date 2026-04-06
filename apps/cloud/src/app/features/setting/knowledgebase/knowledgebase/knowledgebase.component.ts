import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { XpertExtensionViewManifest } from '@metad/contracts'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { derivedAsync } from 'ngxtension/derived-async'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, of, pipe, switchMap } from 'rxjs'
import { KnowledgebaseService, ToastrService, ViewExtensionApiService, routeAnimations } from '../../../../@core'
import { SharedUiModule } from 'apps/cloud/src/app/@shared/ui.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

/**
 * @deprecated use xpert's Knowledges
 */
@Component({
  standalone: true,
  selector: 'pac-settings-knowledgebase',
  templateUrl: './knowledgebase.component.html',
  styleUrls: ['./knowledgebase.component.scss'],
  imports: [RouterModule, TranslateModule, SharedUiModule, EmojiAvatarComponent, NgmI18nPipe],
  animations: [routeAnimations]
})
export class KnowledgebaseComponent extends TranslationBaseComponent {
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly viewExtensionAPI = inject(ViewExtensionApiService)
  readonly _toastrService = inject(ToastrService)
  readonly paramId = injectParams('id')
  readonly viewKey = injectParams('viewKey')

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly knowledgebase = derivedFrom(
    [this.paramId],
    pipe(
      switchMap(([id]) =>
        id
          ? this.refresh$.pipe(
              switchMap(() => this.knowledgebaseService.getOneById(id, { relations: ['copilotModel'] }))
            )
          : of(null)
      )
    ),
    {
      initialValue: null
    }
  )
  readonly extensionViews = derivedAsync<XpertExtensionViewManifest[]>(
    () =>
      this.paramId()
        ? this.viewExtensionAPI.getSlotViews('knowledgebase', this.paramId(), 'detail.main_tabs')
        : of([]),
    { initialValue: [] }
  )

  refresh() {
    this.refresh$.next(true)
  }
}
