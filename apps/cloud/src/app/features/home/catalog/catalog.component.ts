import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BusinessAreasService, StoriesService } from '@metad/cloud/state'
import { sortBy } from 'lodash-es'
import { combineLatest, debounceTime, map, startWith, switchMap, tap } from 'rxjs'
import { IBusinessArea, IStory, listAnimation } from '../../../@core'
import { StoryCardComponent } from '../../../@shared/story'
import { InlineSearchComponent } from '../../../@shared/form-fields'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    NgmCommonModule,
    AppearanceDirective,

    StoryCardComponent,
    InlineSearchComponent
  ],
  selector: 'pac-home-catalog',
  templateUrl: 'catalog.component.html',
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ],
  animations: [listAnimation]
})
export class CatalogComponent {
  private readonly businessAreaService = inject(BusinessAreasService)
  private readonly storiesService = inject(StoriesService)

  searchControl = new FormControl()
  get highlight() {
    return this.searchControl.value
  }
  groups: any[] = []

  public readonly businessAreas$ = this.businessAreaService.getMy()
  public readonly stories$ = this.storiesService.getCatalogs(['updatedBy', 'preview'])

  public readonly groups$ = combineLatest([this.businessAreas$, this.stories$])
    .pipe(
      map(([areas, stories]) => {
        const groups = {}
        stories.forEach((story) => {
          if (story.businessAreaId) {
            // 计算业务域到根业务域的链
            if (!groups[story.businessAreaId]) {
              getParents(story.businessAreaId, areas, groups)
            }
            groups[story.businessAreaId].stories = groups[story.businessAreaId].stories ?? []
            groups[story.businessAreaId].stories.push(story)
          }
        })

        return sortBy(Object.values(groups), 'id').filter((group: any) => group.stories?.length) as any[]
      }),
      switchMap((groups) =>
        this.searchControl.valueChanges.pipe(
          startWith(''),
          debounceTime(300),
          map((search) => {
            search = search?.trim().toLowerCase()
            if (search) {
              const _groups = groups.map((group) => ({
                ...group,
                stories: group.stories.filter(
                  (item) => item.name.toLowerCase().includes(search) || item.description?.toLowerCase().includes(search)
                )
              }))
              return _groups.filter((group) => group.stories.length)
            }

            return groups
          })
        )
      ),
      tap((groups) => this.groups = groups)
    )

  trackById(index: number, item: IStory) {
    return item.id
  }
}

function getParents(businessAreaId: string, areas: IBusinessArea[], areaParents) {
  const area = areas.find((area) => area.id === businessAreaId)
  if (area) {
    if (area?.parentId) {
      const { areas: parents } = getParents(area.parentId, areas, areaParents)
      areaParents[area.id] = {
        id: [...parents, area].map((item) => item.id).join('/'),
        area,
        areas: [...parents, area]
      }
    } else {
      areaParents[businessAreaId] = {
        id: businessAreaId,
        area,
        areas: [area]
      }
    }
  } else {
    areaParents[businessAreaId] = {
      id: businessAreaId,
      areas: []
    }
  }

  return areaParents[businessAreaId] ?? {}
}
