import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { ActivatedRoute } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgmSearchComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { ISemanticModel, IUser, Store, ToastrService } from 'apps/cloud/src/app/@core'
import { uniq } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom, map, switchMap } from 'rxjs'
import { ModelComponent } from '../model.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserRoleSelectComponent, UserProfileComponent, UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    TranslateModule,
    UserRoleSelectComponent,
    UserProfileComponent,
    UserProfileInlineComponent,
    ButtonGroupDirective,
    DensityDirective,
    AppearanceDirective,
    NgmSearchComponent,
    NgmTableComponent
  ],
  selector: 'pac-model-admin',
  templateUrl: 'admin.component.html',
  styleUrl: 'admin.component.scss',
})
export class ModelAdminComponent extends TranslationBaseComponent {
  userLabel = userLabel

  // Injectors
  private modelsService = inject(SemanticModelServerService)
  private store = inject(Store)
  private route = inject(ActivatedRoute)
  readonly #model = inject(ModelComponent)

  searchControl = new FormControl()

  semanticModel: ISemanticModel
  members: { id: string; user: IUser; loading: boolean }[]
  get isOwner() {
    return this.store.user?.id === this.semanticModel?.ownerId
  }

  public readonly refresh$ = new BehaviorSubject<void>(null)

  readonly modelSideMenuOpened = this.#model.sideMenuOpened

  // Subscribers
  private _modelDetailSub = combineLatest([this.refresh$, this.#model.id$])
    .pipe(switchMap(([, id]) => this.modelsService.getById(id ?? null, {relations: ['owner', 'members']})), takeUntilDestroyed())
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
    .pipe(map((text) => text?.trim().toLowerCase()), takeUntilDestroyed())
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
      this._dialog
        .open<UserRoleSelectComponent, any, { users: IUser[] }>(UserRoleSelectComponent, { data: { single: true } })
        .afterClosed()
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
    const value = await firstValueFrom(
      this._dialog.open<UserRoleSelectComponent, any, { users: IUser[] }>(UserRoleSelectComponent).afterClosed()
    )
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
}
