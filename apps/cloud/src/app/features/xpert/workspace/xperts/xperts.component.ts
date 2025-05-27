import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective, uploadYamlFile } from '@metad/core'
import { CdkConfirmDeleteComponent, injectConfirmUnique, NgmCommonModule } from '@metad/ocap-angular/common'
import { AppearanceDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpertBasicDialogComponent, XpertCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { isNil, omitBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  getErrorMessage,
  IXpert,
  OrderTypeEnum,
  routeAnimations,
  ToastrService,
  TXpertTeamDraft,
  XpertService,
  XpertTypeEnum,
  XpertWorkspaceService
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertNewBlankComponent } from '../../xpert/index'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,

    DynamicGridDirective,
    NgmCommonModule,
    AppearanceDirective,
    XpertCardComponent
  ],
  selector: 'xpert-workspace-xperts',
  templateUrl: './xperts.component.html',
  styleUrl: 'xperts.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceXpertsComponent {
  DisplayBehaviour = DisplayBehaviour
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(MatDialog)
  readonly dialog = inject(Dialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertService = inject(XpertService)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly i18n = new NgmI18nPipe()
  readonly confirmUnique = injectConfirmUnique()

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly workspace = this.homeComponent.workspace
  readonly type = this.homeComponent.type
  readonly tags = this.homeComponent.tags
  readonly builtinTags = this.homeComponent.toolTags
  readonly searchText = this.homeComponent.searchText

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly #xperts = derivedAsync(() => {
    const where = {
      type: this.type(),
      latest: true
    }
    if (!this.workspace()) return null
    const workspaceId = this.workspace().id
    return this.refresh$.pipe(
      switchMap(() =>
        this.xpertService.getAllByWorkspace(workspaceId, {
          where: omitBy(where, isNil),
          order: { updatedAt: OrderTypeEnum.DESC },
          relations: ['createdBy', 'tags']
        })
      ),
      map(({ items }) => items.filter((item) => item.latest))
    )
  })

  readonly xperts = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    const tags = this.tags()
    return this.#xperts()
      ?.filter((item) => (tags?.length ? tags.some((t) => item.tags.some((tt) => tt.name === t.name)) : true))
      .filter((item) =>
        searchText
          ? item.title?.toLowerCase().includes(searchText) ||
            item.name.toLowerCase().includes(searchText) ||
            item.description?.toLowerCase().includes(searchText)
          : true
      )
  })

  refresh() {
    this.refresh$.next()
  }

  newBlank() {
    this.dialog
      .open<IXpert>(XpertNewBlankComponent, {
        disableClose: true,
        data: {
          workspace: this.workspace(),
          type: this.type()
        }
      })
      .closed.subscribe((xpert) => {
        if (xpert?.type === XpertTypeEnum.Agent) {
          this.router.navigate(['/xpert/', xpert.id, 'agents'])
        } else if (xpert?.type === XpertTypeEnum.Copilot) {
          this.router.navigate(['/xpert/', xpert.id, 'copilot'])
        }
      })
  }

  deleteXpert(xpert: IXpert) {
    this.dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: xpert.title,
          information: this.#translate.instant('PAC.Xpert.DeleteAllDataXpert', {
            value: xpert.name,
            Default: `Delete all data of xpert '${xpert.name}'?`
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.xpertService.delete(xpert.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, xpert.title)
          this.refresh()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  importDSL() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml, .yml'

    input.onchange = (event: any) => {
      const file = event.target.files[0]
      if (file) {
        uploadYamlFile<TXpertTeamDraft>(file)
          .then((parsedDSL) => {
            // Assuming there's a method to handle the parsed DSL
            this.handleImportedDSL(parsedDSL)
          })
          .catch((error) => {
            this.#toastr.error(
              this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
                ': ' +
                getErrorMessage(error)
            )
          })
      }
    }

    input.click()
  }

  handleImportedDSL(dsl: TXpertTeamDraft) {
    this.dialog
      .open<{ name: string }>(XpertBasicDialogComponent, {
        data: {
          name: dsl.team.name,
          avatar: dsl.team.avatar,
          description: dsl.team.description,
          title: dsl.team.title,
          copilotModel: dsl.team.copilotModel
        }
      })
      .closed.pipe(
        switchMap((basic) => {
          return basic
            ? this.xpertService.importDSL({
                ...dsl,
                team: {
                  ...dsl.team,
                  ...basic,
                  workspaceId: this.workspace().id
                }
              })
            : EMPTY
        })
      )
      .subscribe({
        next: (xpert) => {
          this.router.navigate(['/xpert/', xpert.id])
          this.#toastr.success(
            this.#translate.instant('PAC.Xpert.ImportSuccess', { Default: 'DSL file imported successfully' })
          )
        },
        error: (err) => {
          this.#toastr.error(
            this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
              ': ' +
              getErrorMessage(err)
          )
        }
      })
  }
}
