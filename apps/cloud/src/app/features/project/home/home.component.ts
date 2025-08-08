import { CommonModule } from '@angular/common'
import { Component, inject, ViewContainerRef } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { Router } from '@angular/router'
import { StoriesService } from '@metad/cloud/state'
import { uploadYamlFile } from '@metad/core'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { Story } from '@metad/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, switchMap, tap } from 'rxjs'
import { DefaultCollection, IStory, IStoryTemplate, ProjectAPIService, ToastrService, tryHttp } from '../../../@core'
import { ProjectComponent } from '../project/project.component'
import { StoryCardComponent, StoryCreationComponent, StoryTemplateComponent } from '../../../@shared/story'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    StoryCardComponent,
    MatIconModule,
    TranslateModule,
    MatButtonModule,
    ButtonGroupDirective,
    DensityDirective
  ],
  selector: 'pac-project-home',
  templateUrl: 'home.component.html',
  styles: [
    `
      :host {
        overflow: auto;
        width: 100%;
      }
    `
  ]
})
export class ProjectHomeComponent {
  private projectService = inject(ProjectAPIService)
  private storiesService = inject(StoriesService)
  private _router = inject(Router)
  private _viewContainerRef = inject(ViewContainerRef)
  private projectComponent = inject(ProjectComponent)
  private _dialog = inject(MatDialog)
  private _toastrService = inject(ToastrService)

  storyUploading = false

  get project() {
    return this.projectComponent.project
  }
  get isOwner() {
    return this.projectComponent.isOwner
  }

  public readonly stories$ = this.projectComponent.projectId$.pipe(
    switchMap((projectId) => this.storiesService.getAllByProject(projectId, ['preview'], 10))
  )

  async createStory(template?: IStoryTemplate) {
    const collections = this.projectComponent.collections()
    const story = await firstValueFrom(
      this._dialog
        .open(StoryCreationComponent, {
          data: {
            story: {},
            collections,
            models: this.projectComponent.projectSignal().models
          }
        })
        .afterClosed()
    )

    if (story) {
      if (template) {
        story.templateId = template.id
        story.options = {
          ...(template.options?.story?.options ?? {})
        }
        story.points = template.options?.pages
      }

      await this.projectComponent.tryCreateStory(story)
    }
  }

  async fromTemplate() {
    const template = await firstValueFrom(
      this._dialog
        .open<StoryTemplateComponent, { templateId?: string }, IStoryTemplate>(StoryTemplateComponent, {
          viewContainerRef: this._viewContainerRef,
          panelClass: 'large',
          data: {}
        })
        .afterClosed()
    )
    if (template) {
      await this.createStory(template)
    }
  }

  async uploadStory(story: IStory) {
    const models = this.projectComponent.projectSignal().models
    const collections = this.projectComponent.collections()
    const project = this.projectComponent.projectSignal()
    const _story: Story = await firstValueFrom(
      this._dialog
        .open(StoryCreationComponent, {
          data: {
            story,
            models,
            collections
          }
        })
        .afterClosed()
    )

    if (_story) {
      story.name = _story.name
      story.description = _story.description
      story.collectionId = _story.collectionId === DefaultCollection.id ? null : _story.collectionId
      story.businessAreaId = _story.businessAreaId
      story.models = _story.models
      story.projectId = project.id

      this.storyUploading = true
      await tryHttp(
        this.storiesService.import(story).pipe(
          tap((newStory) => {
            this.storyUploading = false
            this._toastrService.success('PAC.NOTES.STORY.STORY_UPLOAD')
            this.projectComponent.refresh$.next()
            // Navigate to new story viewer
            this._router.navigate(['/story', newStory.id, 'edit'])
          })
        )
      )
    }
  }

  async onFileInput(event) {
    var files = event.target.files[0]
    const fileType = files.name.split('.')
    if (fileType[fileType.length - 1] !== 'yml') {
      this._toastrService.error('PAC.NOTES.STORY.UPLOAD_FILETYPE_ERROR')
      return
    }

    try {
      const story = await uploadYamlFile<IStory>(files)
      await this.uploadStory(story)
    } catch (err) {
      this._toastrService.error('PAC.NOTES.STORY.READ_FILE')
    }
  }
}
