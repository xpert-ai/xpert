import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Inject, inject, Input, Optional } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'
import { RouterModule } from '@angular/router'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { StoriesService, WidgetsService } from '@metad/cloud/state'
import { NgmDialogComponent } from '@metad/components/dialog'
import { BehaviorSubject, distinctUntilChanged, firstValueFrom, map, of, switchMap, tap } from 'rxjs'
import { DefaultProject, ISemanticModel, IStory, ProjectAPIService } from '../../../@core'
import { LazyImgDirective } from '../../directives/lazy-img.directive'
import { MaterialModule } from '../../material.module'
import { CreatedByPipe } from '../../pipes'


@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-selector',
  templateUrl: 'story-selector.component.html',
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    AppearanceDirective,
    CreatedByPipe,
    NgmDialogComponent,

    LazyImgDirective
  ]
})
export class StorySelectorComponent {
  private translateService = inject(TranslateService)
  private storiesService = inject(StoriesService)
  private widgetsService = inject(WidgetsService)
  private projectService = inject(ProjectAPIService)

  @Input() get model(): ISemanticModel {
    return this._model$.value
  }
  set model(value) {
    this._model$.next(value)
  }
  private _model$ = new BehaviorSubject<ISemanticModel>(null)

  get title() {
    return this.data.title
  }

  formGroup = new FormGroup({
    projectControl: new FormControl(null, [Validators.required]),
    storyControl: new FormControl(null, [Validators.required]),
    pointControl: new FormControl(null, [Validators.required])
  })
  get projectControl() {
    return this.formGroup.get('projectControl') as FormControl
  }
  get storyControl() {
    return this.formGroup.get('storyControl') as FormControl
  }
  get pointControl() {
    return this.formGroup.get('pointControl') as FormControl
  }
  
  projectStories = new Map<string, IStory[]>()

  public readonly projects$ = this.projectService.getMy(['models'])
    .pipe(
      switchMap((projects) => this._model$.pipe(
        map((model) => projects.map((project) => ({
          ...project,
          modelNotInProject: !project.models.find((item) => item.id === model?.id)
        }))),
      )),
      switchMap(async (items) => {
        const defaultName = await firstValueFrom(this.translateService.get('PAC.Project.DefaultProject', {Default: 'Default'}))

        return [
          {
            ...DefaultProject,
            name: defaultName,
            modelNotInProject: false
          },
          ...items
        ]
      })
    )


  public readonly stories$ = this.projectControl.valueChanges.pipe(
    map((project) => project?.id),
    distinctUntilChanged(),
    switchMap((id) =>
      this.projectStories.get(id) ? of(this.projectStories.get(id)) :
      this.storiesService.getAllByProject(id === DefaultProject.id ? null : id, ['points', 'models'])
        .pipe(tap((stories) => this.projectStories.set(id, stories)))
    ),
    switchMap((stories) => this._model$.pipe(
      map((model) => stories.map((story) => ({
        ...story,
        modelNotInStory: !story.models.find((item) => item.id === model?.id)
      }))),
    ))
  )

  public readonly points$ = this.storyControl.valueChanges.pipe(
    map((story) => story?.points)
  )
  constructor(@Optional() @Inject(MAT_DIALOG_DATA) private data,
    @Optional()
    public dialogRef: MatDialogRef<StorySelectorComponent> ) {
    this.model = this.data?.model
  }

  compareWith(a, b) {
    return a?.id === b?.id
  }

  async onApply() {
    const widget = await firstValueFrom(this.widgetsService.create({
      storyId: this.storyControl.value.id,
      pointId: this.pointControl.value.id,
      ...(this.data.widget),
      dataSettings: {
        ...(this.data.widget.dataSettings ?? {}),
      }
    }))

    this.dialogRef?.close({...widget, pageKey: this.pointControl.value.key})
  }
}
