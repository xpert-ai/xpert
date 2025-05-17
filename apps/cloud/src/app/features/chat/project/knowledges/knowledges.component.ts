import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  IKnowledgebase,
  injectProjectService,
  injectToastr,
  IXpertToolset,
  KnowledgebaseService,
  OrderTypeEnum,
  XpertToolsetService
} from '@cloud/app/@core'
import { MCPMarketplaceComponent, TXpertMCPManageComponentRet, XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { ToolsetCardComponent } from '@cloud/app/@shared/xpert'
import {
  DisappearFadeOut,
  DynamicGridDirective,
  listAnimation,
  listEnterAnimation,
  ListSlideStaggerAnimation
} from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil, omitBy } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, map, startWith, switchMap } from 'rxjs'
import { ChatProjectHomeComponent } from '../home/home.component'
import { ChatProjectComponent } from '../project.component'
import { KnowledgebaseCardComponent } from '@cloud/app/@shared/knowledge'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    DynamicGridDirective,
    KnowledgebaseCardComponent
  ],
  selector: 'chat-project-knowledges',
  templateUrl: './knowledges.component.html',
  styleUrl: 'knowledges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [DisappearFadeOut, listAnimation, ListSlideStaggerAnimation, listEnterAnimation]
})
export class ChatProjectKnowledgesComponent {
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectSercice = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #projectHomeComponent = inject(ChatProjectHomeComponent)
  readonly #toastr = injectToastr()

  readonly project = this.#projectComponent.project

  readonly workspace = this.#projectHomeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  // Knowledges in project
  readonly knowledgebases = this.#projectHomeComponent.knowledgebases

  readonly formControl = new FormControl()
  readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly loading = signal(false)

  // knowledgebases in workspace
  readonly #knowledgebases = derivedAsync(() => {
    const where = {
    }
    const workspaceId = this.workspaceId()
    if (!workspaceId) return EMPTY
    return this.refresh$.pipe(
      switchMap(() =>
        this.#knowledgebaseService.getAllByWorkspace(workspaceId, {
          where: omitBy(where, isNil),
          relations: ['createdBy'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      ),
      map(({ items }) => items)
    )
  })

  // Searched kbs in workspace
  readonly wsKnowledgebases = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    return this.#knowledgebases()
      ?.filter((knowledgebase) =>
        searchText
          ? knowledgebase.name.toLowerCase().includes(searchText) || knowledgebase.description?.toLowerCase().includes(searchText)
          : true
      )
      .map((knowledgebase) => ({
        knowledgebase,
        added: this.knowledgebases()?.some((_) => _.id === knowledgebase.id)
      }))
  })

  /**
   * Add kb from workspace into project
   */
  addKnowledgebase(kb: IKnowledgebase) {
    this.loading.set(true)
    this.projectSercice.addKnowledgebase(this.project().id, kb.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.knowledgebases.update((state) => [kb, ...(state ?? []).filter((_) => _.id !== kb.id)])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  /**
   * Remove kb from project
   */
  removeKB(kb: IKnowledgebase) {
    this.loading.set(true)
    this.projectSercice.removeKnowledgebase(this.project().id, kb.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.knowledgebases.update((state) => (state ?? []).filter((_) => _.id !== kb.id))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  openKnowledgebase(kb: IKnowledgebase) {
    this.#dialog
      .open<TXpertMCPManageComponentRet>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolsetId: kb.id
        }
      })
      .closed
      .subscribe({
        next: (ret) => {
          if (ret?.deleted) {
            // If deleted from workspace
            // this.removeTool(kb)
            this.refreshWorkspace()
          } else if (ret?.saved) {
            this.refreshWorkspace()
            this.#projectHomeComponent.refreshTools()
          }
        }
      })
  }

  refreshWorkspace() {
    this.refresh$.next()
  }
}
