import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { CdkConfirmDeleteComponent, NgmSearchComponent, NgmTableComponent, TableColumn } from '@metad/ocap-angular/common'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { combineLatestWith, debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { ChatBIModelService, ToastrService, getErrorMessage, routeAnimations } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'pac-settings-chatbi-models',
  templateUrl: './models.component.html',
  styleUrls: ['./models.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
    AppearanceDirective,
    NgmTableComponent,
    NgmSearchComponent
  ],
  animations: [routeAnimations]
})
export class ChatBIModelsComponent extends TranslationBaseComponent {
  readonly modelsService = inject(SemanticModelServerService)
  readonly chatbiModelsService = inject(ChatBIModelService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dialog = inject(Dialog)

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly searchControl = new FormControl('')
  readonly loading = signal(false)

  // Filter models based on search text
  // Search matches model name, entityCaption, and entityDescription
  readonly models = toSignal(
    this.refresh$.pipe(
      tap(() => this.loading.set(true)),
      switchMap(() => this.chatbiModelsService.getAllInOrg({ relations: ['model'] }).pipe(map(({ items }) => items))),
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          map((text) => text?.toLowerCase() || ''),
          startWith('')
        )
      ),
      map(([items, search]) => {
        if (!search) {
          return items
        }
        // Filter items that match search text in model name, entityCaption, or entityDescription
        return items.filter((item) => {
          const modelName = item.model?.name?.toLowerCase() || ''
          const entityCaption = item.entityCaption?.toLowerCase() || ''
          const entityDescription = item.entityDescription?.toLowerCase() || ''
          return (
            modelName.includes(search) ||
            entityCaption.includes(search) ||
            entityDescription.includes(search)
          )
        })
      }),
      tap(() => this.loading.set(false))
    )
  )

  readonly columns = signal<TableColumn[]>([
    {
      name: 'model',
      caption: 'Model'
    }
  ])

  addModel() {
    this.router.navigate(['create'], { relativeTo: this.route })
  }

  refresh() {
    this.refresh$.next()
  }

  editModel(id: string) {
    this.router.navigate([id], { relativeTo: this.route })
  }

  deleteModel(id: string, entity: string, cubeCaption: string) {
    this.dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: entity,
          information: cubeCaption
        }
      })
      .closed.pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.chatbiModelsService.delete(id)
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this._toastrService.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          return this.refresh()
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }
}
