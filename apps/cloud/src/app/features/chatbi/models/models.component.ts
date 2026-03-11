import { CommonModule } from '@angular/common'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmDisplayBehaviourComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { DensityDirective, EntityCapacity } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatbiService } from '../chatbi.service'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { NgmEntitySchemaComponent } from '@metad/ocap-angular/entity'
import { AppService } from '../../../app.service'
import { ChatbiHomeComponent } from '../home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    RouterModule,
    TranslateModule,
    ScrollingModule,
    ZardIconComponent,
    ZardButtonComponent,
    MatProgressSpinnerModule,
    DensityDirective,
    NgmSearchComponent,
    NgmDisplayBehaviourComponent,
    NgmEntitySchemaComponent
  ],
  selector: 'pac-chatbi-models',
  templateUrl: './models.component.html',
  styleUrl: 'models.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatbiModelsComponent {
  EntityCapacity = EntityCapacity
  
  readonly chatbiService = inject(ChatbiService)
  readonly appService = inject(AppService)
  readonly homeComponent = inject(ChatbiHomeComponent)

  readonly isMobile = this.appService.isMobile
  readonly search = model<string>('')
  readonly searchText = computed(() => this.search().trim().toLowerCase())

  readonly loadingCubes = this.chatbiService.loadingCubes
  readonly cubeSelectOptions = computed(() => {
    const search = this.searchText()
    let cubes = this.chatbiService
      .cubes()
      ?.map((item) => ({ key: item.name, caption: item.caption, value: item, expanded: false }))
    if (search) {
      cubes = cubes?.filter(
        (item) => item.caption?.toLowerCase().includes(search) || item.key.toLowerCase().includes(search)
      )
    }

    return cubes
  })

  readonly cube = this.chatbiService.entity

  readonly dataSourceName = this.chatbiService.dataSourceName

  trackByKey(index, item): string {
    return item?.key
  }
  
  onCubeChange(key: string) {
    this.chatbiService.setEntity(key)
  }

  toggleExpanded(option: { expanded?: boolean }) {
    option.expanded = !option.expanded
  }

  close() {
    this.homeComponent.openCubes.set(false)
  }
}
