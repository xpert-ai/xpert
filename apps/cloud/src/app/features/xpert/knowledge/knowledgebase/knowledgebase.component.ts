import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, of, pipe, switchMap } from 'rxjs'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { KnowledgebaseService, ToastrService, routeAnimations } from '../../../../@core'
import { MatDividerModule } from '@angular/material/divider'
import { MatTabsModule } from '@angular/material/tabs'
import { MatIconModule } from '@angular/material/icon'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase',
  templateUrl: './knowledgebase.component.html',
  styleUrls: ['./knowledgebase.component.scss'],
  imports: [RouterModule, TranslateModule, MatDividerModule, MatTabsModule, MatIconModule, EmojiAvatarComponent],
  animations: [routeAnimations]
})
export class KnowledgebaseComponent extends TranslationBaseComponent {
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly paramId = injectParams('id')

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly knowledgebase = derivedFrom(
    [this.paramId],
    pipe(
      switchMap(([id]) =>
        id
          ? this.refresh$.pipe(
              switchMap(() => this.knowledgebaseService.getOneById(id, { relations: ['copilotModel', 'xperts'] }))
            )
          : of(null)
      )
    ),
    {
      initialValue: null
    }
  )

  refresh() {
    this.refresh$.next(true)
  }
}
