import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, OnInit, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, NavigationEnd, Router, RouterModule, UrlSegment } from '@angular/router'
import { nonBlank, routeAnimations, LeanRightEaseInAnimation } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NX_STORY_STORE, NxStoryStore, Story, StoryModel } from '@metad/story/core'
import { NxDesignerModule, NxSettingsPanelService } from '@metad/story/designer'
import { TranslateModule } from '@ngx-translate/core'
import { injectTranslate, ToastrService } from 'apps/cloud/src/app/@core'
import { isNil, negate } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom, of } from 'rxjs'
import { debounceTime, distinctUntilChanged, filter, map, pairwise, startWith, switchMap } from 'rxjs/operators'
import { AppService } from '../../../../app.service'
import { injectCalculatedCommand } from '../copilot'
import { ModelComponent } from '../model.component'
import { SemanticModelService } from '../model.service'
import { ModelCubeStructureComponent } from './cube-structure/cube-structure.component'
import { ModelEntityService } from './entity.service'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatIconModule } from '@angular/material/icon'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTabsModule } from '@angular/material/tabs'
import { ModelCubeFactComponent } from './fact/fact.component'
import { AggregationRole, isEntitySet } from '@metad/ocap-core'
import { ModelEntityCalculationComponent } from './calculation/calculation.component'
import { NgmOcapCoreService } from '@metad/ocap-angular/core'

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
    MatTooltipModule,
    MatIconModule,
    MatSidenavModule,
    MatTabsModule,
    NgmCommonModule,
    NxDesignerModule,
    ModelCubeStructureComponent,
    ModelCubeFactComponent,
    ModelEntityCalculationComponent
  ],
  animations: [routeAnimations, LeanRightEaseInAnimation]
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
  readonly i18n = injectTranslate('PAC.MODEL')
  readonly #storyStore = inject<NxStoryStore>(NX_STORY_STORE)
  readonly #model = inject(ModelComponent)
  readonly #coreService = inject(NgmOcapCoreService)

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
  readonly openedCalculation = signal<string>(null)

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
  private entityUpdateEventSub = this.#coreService
    ?.onEntityUpdate()
    .pipe(takeUntilDestroyed())
    .subscribe(({ type, dataSettings, parameter, property }) => {
      if (type === 'Parameter') {
        this.entityService.parameters.update((state) => {
          const parameters = state ? [...state] : []
          const index = parameters.findIndex((p) => p.__id__ === parameter.__id__)
          if (index > -1) {
            parameters[index] = {...parameter}
          } else {
            parameters.push({...parameter})
          }
          return parameters
        })
      } else {
        // @todo
      }
    })
  
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
   * Monitor the current entity type changes and print out the error information;
   * SQL Model / Olap Model: Used to verify whether the Schema is correct
   */
  private entityErrorSub = this.entityService.entitySet$
    .pipe(filter(nonBlank), debounceTime(2000), startWith(null), pairwise(), takeUntilDestroyed())
    .subscribe(([prev, curr]) => {
      if (isEntitySet(curr)) {
        if (!prev || !isEntitySet(prev)) {
          this.#toastr.success(this.i18n()?.CubeCorrect || 'Cube correct!')
        }
      } else if(curr) {
        this.#toastr.danger(curr, '', {}, {
          duration: 5 * 1000, // 5s
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        })
      }
    })

  ngOnInit() {
    this.settingsService.setEditable(true)
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
    // this.router.navigate([`calculation/${event.__id__}`], { relativeTo: this.route })
    this.openedCalculation.set(event.__id__)
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
