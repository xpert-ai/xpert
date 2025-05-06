import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { ActivatedRoute, Router } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { injectConfirmDelete, NgmSearchComponent, NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, injectToastr, ISemanticModel, IUser, Store, ToastrService } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import {
  UserProfileComponent,
  UserProfileInlineComponent,
  UserRoleSelectComponent
} from 'apps/cloud/src/app/@shared/user'
import { uniq } from 'lodash-es'
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, map, switchMap } from 'rxjs'
import { ModelComponent } from '../model.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    TranslateModule,
    UserProfileComponent,
    UserProfileInlineComponent,
    ButtonGroupDirective,
    DensityDirective,
    AppearanceDirective,
    NgmSearchComponent,
    NgmTableComponent,
    NgmSpinComponent
  ],
  selector: 'pac-model-admin',
  templateUrl: 'admin.component.html',
  styleUrl: 'admin.component.scss'
})
export class ModelAdminComponent extends TranslationBaseComponent {
  userLabel = userLabel

  // Injectors
  private modelsService = inject(SemanticModelServerService)
  private store = inject(Store)
  private route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #model = inject(ModelComponent)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()

  searchControl = new FormControl()

  semanticModel: ISemanticModel
  members: { id: string; user: IUser; loading: boolean }[]
  get isOwner() {
    return this.store.user?.id === this.semanticModel?.ownerId
  }

  public readonly refresh$ = new BehaviorSubject<void>(null)

  readonly modelSideMenuOpened = this.#model.sideMenuOpened

  readonly loading = signal(false)

  // Subscribers
  private _modelDetailSub = combineLatest([this.refresh$, this.#model.id$])
    .pipe(
      switchMap(([, id]) => this.modelsService.getById(id ?? null, { relations: ['owner', 'members'] })),
      takeUntilDestroyed()
    )
    .subscribe((semanticModel) => {
      this.semanticModel = semanticModel
      this.members = semanticModel.members.map((user) => ({
        id: user.id,
        user,
        loading: false
      }))
      this._cdr.detectChanges()
    })
  private _searchSub = this.searchControl.valueChanges
    .pipe(
      map((text) => text?.trim().toLowerCase()),
      takeUntilDestroyed()
    )
    .subscribe((text) => {
      this.members = (
        text
          ? this.semanticModel.members.filter(
              (member) =>
                member.email?.toLowerCase().includes(text) ||
                member.fullName?.toLowerCase().includes(text) ||
                member.firstName?.toLowerCase().includes(text) ||
                member.lastName?.toLowerCase().includes(text)
            )
          : this.semanticModel.members
      ).map((user) => ({
        id: user.id,
        user,
        loading: false
      }))
    })

  constructor(
    private _dialog: MatDialog,
    private _cdr: ChangeDetectorRef,
    private _toastrService: ToastrService
  ) {
    super()
  }

  async transferOwner() {
    const value = await firstValueFrom(
      this.#dialog.open<{ users: IUser[] }>(UserRoleSelectComponent, { data: { single: true } }).closed
    )
    const user = value?.users?.[0]
    if (user) {
      try {
        await firstValueFrom(this.modelsService.updateOwner(this.semanticModel.id, user.id, { relations: ['owner'] }))
        this.semanticModel.owner = user
        this.semanticModel.ownerId = user.id
        this._toastrService.success('PAC.Project.TransferOwnership', { Default: 'Transfer Ownership' })
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  async openMemberSelect() {
    const value = await firstValueFrom(this.#dialog.open<{ users: IUser[] }>(UserRoleSelectComponent).closed)
    if (value) {
      this.addMembers(value.users.map(({ id }) => id))
    }
  }

  async addMembers(members: string[]) {
    await firstValueFrom(
      this.modelsService.updateMembers(this.semanticModel.id, uniq([...members, ...this.members.map(({ id }) => id)]))
    )
    this.refresh$.next()
  }

  async removeMember(id: string) {
    const member = this.members.find((item) => item.id === id)
    member.loading = true
    await firstValueFrom(this.modelsService.deleteMember(this.semanticModel.id, id))
    this.refresh$.next()
  }

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }

  deleteModel() {
    const information = this.getTranslation('PAC.MODEL.TOASTR.DeleteModelPermanently', {
      Default: 'Delete this model permanently'
    })
    const model = this.semanticModel
    this.confirmDelete({
      value: model.name,
      information: information + '?'
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.modelsService.delete(model.id)
          }
          return EMPTY
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#toastr.success('PAC.MODEL.TOASTR.ModelDelete', { Default: 'Model delete' })
          this.#router.navigate(['/models'])
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
