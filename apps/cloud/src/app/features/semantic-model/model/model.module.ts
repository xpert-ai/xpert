import { CdkMenuModule } from '@angular/cdk/menu'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NxActionStripModule } from '@metad/components/action-strip'
import { NxEditorModule } from '@metad/components/editor'
import {
  NgmCommonModule,
  NgmDrawerTriggerComponent,
  NgmTableComponent,
  ResizerModule,
  SplitterModule
} from '@metad/ocap-angular/common'
import { NgmCopilotChatComponent } from '@metad/copilot-angular'
import { OcapCoreModule, provideOcapCore } from '@metad/ocap-angular/core'
import { NgmDesignerFormComponent, NxDesignerModule, STORY_DESIGNER_COMPONENT } from '@metad/story/designer'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { ModelUploadComponent } from '../upload/upload.component'
import { ModelCreateEntityComponent } from './create-entity/create-entity.component'
import { ModelComponent } from './model.component'
import { ModelOverviewComponent } from './overview/overview.component'
import { ModelPreferencesComponent } from './preferences/preferences.component'
import { ModelRoutingModule } from './routing'
import {
  CalculatedMemberAttributesSchema,
  CalculatedMemberSchemaService,
  CubeAttributesSchema,
  CubeSchemaService,
  DimensionAttributesSchema,
  DimensionSchemaService,
  DimensionUsageSchemaService,
  HierarchyAttributesSchema,
  HierarchySchemaService,
  LevelAttributesSchema,
  LevelSchemaService,
  MeasureAttributesSchema,
  MeasureSchemaService
} from './schema/index'
import { ModelDesignerType } from './types'
import { DirtyBadgeComponent } from '../../../@shared/badge'
import { MaterialModule } from '../../../@shared/material.module'
import { CreatedByPipe, UserPipe } from '../../../@shared/pipes'
import { DateRelativePipe } from '@cloud/app/@core'
import { NgmFormlyFactModule } from '../formly/fact'

@NgModule({
  declarations: [ModelComponent, ModelOverviewComponent, ModelCreateEntityComponent, ModelPreferencesComponent],
  imports: [
    ModelRoutingModule,
    CommonModule,
    FormsModule,
    MaterialModule,
    CdkMenuModule,
    TranslateModule,
    ReactiveFormsModule,
    ScrollingModule,

    NxEditorModule,
    CreatedByPipe,
    UserPipe,
    NxActionStripModule,
    NxDesignerModule,
    ModelUploadComponent,
    DirtyBadgeComponent,

    // OCAP Modules
    ResizerModule,
    SplitterModule,
    OcapCoreModule,
    NgmCommonModule,
    NgmCopilotChatComponent,
    NgmTableComponent,
    NgmDrawerTriggerComponent,

    // Thirdparty
    MonacoEditorModule.forRoot(),
    ContentLoaderModule,
    FormlyModule,
    NgmFormlyFactModule,

    // 
    DateRelativePipe
  ],
  providers: [
    provideOcapCore(),
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.cube,
        component: NgmDesignerFormComponent,
        schema: CubeSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.dimension,
        component: NgmDesignerFormComponent,
        schema: DimensionSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.dimensionUsage,
        component: NgmDesignerFormComponent,
        schema: DimensionUsageSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.hierarchy,
        component: NgmDesignerFormComponent,
        schema: HierarchySchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.level,
        component: NgmDesignerFormComponent,
        schema: LevelSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.measure,
        component: NgmDesignerFormComponent,
        schema: MeasureSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.calculatedMember,
        component: NgmDesignerFormComponent,
        schema: CalculatedMemberSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.cubeAttributes,
        component: NgmDesignerFormComponent,
        schema: CubeAttributesSchema
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.dimensionAttributes,
        component: NgmDesignerFormComponent,
        schema: DimensionAttributesSchema
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.hierarchyAttributes,
        component: NgmDesignerFormComponent,
        schema: HierarchyAttributesSchema
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.levelAttributes,
        component: NgmDesignerFormComponent,
        schema: LevelAttributesSchema
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.measureAttributes,
        component: NgmDesignerFormComponent,
        schema: MeasureAttributesSchema
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ModelDesignerType.calculatedMemberAttributes,
        component: NgmDesignerFormComponent,
        schema: CalculatedMemberAttributesSchema
      },
      multi: true
    }
  ]
})
export class ModelModule {}
