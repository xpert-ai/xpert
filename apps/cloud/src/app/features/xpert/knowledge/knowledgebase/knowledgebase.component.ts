import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, inject, model } from '@angular/core'
import { RouterModule } from '@angular/router'
import { AppService } from '@cloud/app/app.service'
import { NgmCopyComponent } from '@metad/ocap-angular/common'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, of, pipe, switchMap } from 'rxjs'
import { KnowledgebaseService, KnowledgebaseTypeEnum, ToastrService, routeAnimations } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase',
  templateUrl: './knowledgebase.component.html',
  styleUrls: ['./knowledgebase.component.scss'],
  imports: [RouterModule, TranslateModule, CdkMenuModule, NgmCopyComponent, EmojiAvatarComponent],
  animations: [routeAnimations]
})
export class KnowledgebaseComponent {
  eKnowledgebaseTypeEnum = KnowledgebaseTypeEnum

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly paramId = injectParams('id')
  readonly appService = inject(AppService)

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly knowledgebase = derivedFrom(
    [this.paramId],
    pipe(
      switchMap(([id]) =>
        id
          ? this.refresh$.pipe(
              switchMap(() =>
                this.knowledgebaseService.getOneById(id, {
                  relations: ['copilotModel', 'rerankModel', 'visionModel', 'xperts']
                })
              )
            )
          : of(null)
      )
    ),
    {
      initialValue: null
    }
  )

  readonly type = computed(() => this.knowledgebase()?.type)
  readonly avatar = computed(() => this.knowledgebase()?.avatar)
  readonly pipelineId = computed(() => this.knowledgebase()?.pipelineId)
  readonly serviceApiEnabled = computed(() => this.knowledgebase()?.apiEnabled)

  // Sidebar
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())

  refresh() {
    this.refresh$.next(true)
  }

  toggleSideMenu() {
    this.sideMenuOpened.update((state) => !state)
  }
}
