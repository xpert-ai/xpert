import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatExpansionModule } from '@angular/material/expansion'
import { SemanticModelServerService } from '@metad/cloud/state'
import { isEntitySet } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { SemanticModelEntityService, ToastrService } from 'apps/cloud/src/app/@core'
import { catchError, combineLatest, delay, map, of, startWith, switchMap, tap } from 'rxjs'
import { SemanticModelService } from '../model.service'
import { ModelMembersCubeComponent } from './cube/cube.component'
import { ModelComponent } from '../model.component'
import { NgmSpinComponent } from '@metad/ocap-angular/common'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatExpansionModule,
    NgmSpinComponent,
    ModelMembersCubeComponent
  ],
  selector: 'pac-model-members',
  templateUrl: 'members.component.html',
  styleUrl: 'members.component.scss'
})
export class ModelMembersComponent {
  readonly modelService = inject(SemanticModelService)
  readonly modelEntityService = inject(SemanticModelEntityService)
  readonly modelsService = inject(SemanticModelServerService)
  readonly toastrService = inject(ToastrService)
  readonly #model = inject(ModelComponent)

  readonly modelSideMenuOpened= this.#model.sideMenuOpened
  readonly cubes = toSignal(this.modelService.cubes$)
  readonly virtualCubes = toSignal(this.modelService.virtualCubes$)

  readonly _cubes = computed(() => {
    const cubes = this.cubes() ?? []
    const virtualCubes = this.virtualCubes() ?? []
    return [...cubes, ...virtualCubes].map((cube) => {
      return {
        name: cube.name,
        caption: cube.caption
      }
    })
  })

  readonly loading = signal(true)

  readonly allCubes = toSignal(
    toObservable(this._cubes).pipe(
      /**
       * @todo
       */
      delay(1000),
      switchMap((cubes) => {
        this.loading.set(true)
        return combineLatest([
          this.modelEntityService.getAll(this.modelService.modelSignal().id),
          combineLatest(
            cubes.map((cube) =>
              this.modelService.selectEntitySet(cube.name).pipe(
                map((entitySet) => ({
                  ...cube,
                  entityType: isEntitySet(entitySet) ? entitySet.entityType : null
                })),
                catchError((err) => {
                  console.error(err)
                  return of(cube)
                })
              )
            )
          ).pipe(startWith([]))
        ]).pipe(
          map(([entities, cubes]) => {
            return cubes.map((cube) => {
              return {
                ...cube,
                __entity__: entities.items.find((entity) => entity.name === cube.name)
                // id: entities.items.find((entity) => entity.name === cube.name)?.id,
                // options: entities.items.find((entity) => entity.name === cube.name)?.options
              }
            })
          })
        )
      }),
      tap(() => this.loading.set(false))
    )
  )

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }
}
