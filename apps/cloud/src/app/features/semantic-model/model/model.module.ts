import { NgModule } from '@angular/core'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { NgmDesignerFormComponent, STORY_DESIGNER_COMPONENT } from '@metad/story/designer'
import { MonacoEditorModule } from 'ngx-monaco-editor'
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
import { NgmFormlyFactModule } from '../formly/'

@NgModule({
  declarations: [],
  imports: [
    ModelRoutingModule,
    // Thirdparty
    MonacoEditorModule.forRoot(),

    NgmFormlyFactModule
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
