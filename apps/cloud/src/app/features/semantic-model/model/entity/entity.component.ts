import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, OnInit, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, NavigationEnd, Router, RouterModule, UrlSegment } from '@angular/router'
import { nonBlank, routeAnimations } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NX_STORY_STORE, NxStoryStore, Story, StoryModel } from '@metad/story/core'
import { NxDesignerModule, NxSettingsPanelService } from '@metad/story/designer'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService } from 'apps/cloud/src/app/@core'
import { isNil, negate } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom, of } from 'rxjs'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { AppService } from '../../../../app.service'
import { injectCalculatedCommand } from '../copilot'
import { ModelComponent } from '../model.component'
import { SemanticModelService } from '../model.service'
import { ModelCubeStructureComponent } from './cube-structure/cube-structure.component'
import { ModelEntityService } from './entity.service'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatIconModule } from '@angular/material/icon'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTabsModule } from '@angular/material/tabs'
import { ModelCubeFactComponent } from './fact/fact.component'

@Component({
  standalone: true,
  selector: 'pac-model-entity',
  templateUrl: 'entity.component.html',
  styleUrls: ['entity.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ModelEntityService, NxSettingsPanelService],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    MatButtonModule,
    MatTooltipModule,
    MatIconModule,
    MatSidenavModule,
    MatTabsModule,
    NgmCommonModule,
    NxDesignerModule,
    ModelCubeStructureComponent,
    ModelCubeFactComponent
  ],
  animations: [routeAnimations]
})
export class ModelEntityComponent implements OnInit {
  readonly #logger = inject(NGXLogger)
  public appService = inject(AppService)
  private modelService = inject(SemanticModelService)
  private entityService = inject(ModelEntityService)
  public settingsService = inject(NxSettingsPanelService)
  readonly #toastr = inject(ToastrService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  readonly #storyStore = inject<NxStoryStore>(NX_STORY_STORE)
  readonly #model = inject(ModelComponent)

  @HostBinding('class.pac-model-entity') _isModelEntity = true
  @HostBinding('class.pac-fullscreen')
  public isFullscreen = false

  private zIndex = 3
  readonly detailsOpen = model(false)
  // Cube structure opened state
  readonly drawerOpened = model(true)
  readonly modelSideMenuOpened= this.#model.sideMenuOpened

  public readonly entityId$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter(negate(isNil)),
    map(decodeURIComponent),
    distinctUntilChanged()
  )
  // 当前子组件
  public readonly route$ = this.router.events.pipe(
    filter((event) => event instanceof NavigationEnd),
    startWith({}),
    switchMap(() => this.route.firstChild?.url ?? of(null)),
    map((url: UrlSegment[]) => url?.[0]?.path)
  )

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly isMobile = toSignal(this.appService.isMobile$)
  public readonly modelType$ = this.modelService.modelType$
  readonly entityType = this.entityService.entityType
  readonly cube = toSignal(this.entityService.cube$)
  readonly openedFact = signal(false)

  /**
  |--------------------------------------------------------------------------
  | Copilot Commands
  |--------------------------------------------------------------------------
  */
  #calculatedMeasureCommand = injectCalculatedCommand()

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private entitySub = this.entityId$.pipe(takeUntilDestroyed()).subscribe((id) => {
    this.entityService.init(id)
    this.modelService.setCrrentEntity(id)
  })

  /**
   * When selected property first time to open the attributes panel
   */
  readonly #selectedPropertySub = toObservable(this.entityService.selectedProperty)
    .pipe(
      map((selected) => !!selected),
      distinctUntilChanged(),
      filter(Boolean),
      takeUntilDestroyed()
    )
    .subscribe((selected) => {
      this.detailsOpen.set(true)
    })

  /**
   * 监听当前实体类型变化, 将错误信息打印出来;
   * SQL Model / Olap Model: 用于验证 Schema 是否正确
   */
  private entityErrorSub = this.entityService.entityError$
    .pipe(filter(nonBlank), takeUntilDestroyed())
    .subscribe((error) => {
      this.#toastr.error(error)
    })

  ngOnInit() {
    this.entityService.setSelectedProperty(null)
  }

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex)
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex)
    }
  }

  onDesignerDrawerChange(opened: boolean) {
    this.settingsService.setEditable(opened)
  }

  toggleDesignPanel() {
    if (!this.detailsOpen()) {
      this.settingsService.setEditable(true)
    }
    this.detailsOpen.update((state) => !state)
  }

  toggleCubeDesigner() {
    if (this.detailsOpen() && !this.entityService.selectedProperty()) {
      this.detailsOpen.set(false)
    } else {
      this.entityService.setSelectedProperty(null)
      this.settingsService.setEditable(true)
      this.detailsOpen.set(true)
    }
  }

  toggleFact() {
    this.openedFact.update((state) => !state)
  }

  openSub(event) {
    this.router.navigate([event + '/'], { relativeTo: this.route })
  }

  propertySelectedChange(selected: string) {
    this.detailsOpen.set(true)
  }

  onPropertyEdit(event) {
    this.router.navigate([`calculation/${event.__id__}`], { relativeTo: this.route })
  }

  toggleFullscreen() {
    if (this.isFullscreen) {
      this.appService.exitFullscreen(this.zIndex)
      this.isFullscreen = false
    } else {
      this.appService.requestFullscreen(this.zIndex)
      this.isFullscreen = true
    }
  }

  async createStory(story: Partial<Story>) {
    try {
      const newStory = await firstValueFrom(
        this.#storyStore.createStory({
          ...story,
          model: {
            id: this.#model.model.id
          } as StoryModel,
          businessAreaId: this.#model.model.businessAreaId
        })
      )

      this.openStory(newStory.id)
    } catch (err) {
      this.#toastr.error(err, 'PAC.MODEL.MODEL.CreateStory')
    }
  }

  openStory(id: string) {
    this.router.navigate([`/story/${id}/edit`])
  }

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }
}
