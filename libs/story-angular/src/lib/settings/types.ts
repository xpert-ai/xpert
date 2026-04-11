import { ComponentSettingsType } from '@xpert-ai/story/core'
import { NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@xpert-ai/story/designer'
import { StoryFilterBarSchemaService } from '@xpert-ai/story/widgets/filter-bar'
import { FlexLayoutSchemaService, LinkedAnalysisSchemaService, StoryPointBuilderSchema } from './schemas'

export function provideStorySettings() {
  return [
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ComponentSettingsType.StoryPoint,
        component: NxComponentSettingsComponent,
        schema: StoryPointBuilderSchema,
        icon: 'handyman'
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ComponentSettingsType.LinkedAnalysis,
        component: NxComponentSettingsComponent,
        schema: LinkedAnalysisSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ComponentSettingsType.FlexLayout,
        component: NxComponentSettingsComponent,
        schema: FlexLayoutSchemaService
      },
      multi: true
    },
    {
      provide: STORY_DESIGNER_COMPONENT,
      useValue: {
        type: ComponentSettingsType.StoryFilterBar,
        component: NxComponentSettingsComponent,
        schema: StoryFilterBarSchemaService
      },
      multi: true
    }
  ]
}

// /**
//  * @deprecated
//  */
// export function generateDimensionHierarchyLevelListSchema(entityType: EntityType) {
//   return isNil(entityType?.properties)
//     ? []
//     : Object.keys(entityType.properties)
//         .filter(
//           (key) =>
//             entityType.semantics !== 'aggregate' ||
//             (entityType.properties[key].role === AggregationRole.dimension ||
//             entityType.properties[key].role === AggregationRole.hierarchy ||
//             entityType.properties[key].role === AggregationRole.level)
//         )
//         .map((key) => {
//           const property = entityType.properties[key]
//           return {
//             label: `${property.role === 'level' ? '-- ' : ''}${property.label} (${
//               property.name
//             })`,
//             value: property.name,
//           }
//         })
// }

// /**
//  * @deprecated
//  */
// export function generateMeasureListSchema(entityType: EntityType) {
//   return isNil(entityType?.properties)
//     ? []
//     : Object.keys(entityType.properties)
//         .filter((key) => entityType.semantics !== 'aggregate' ||
//           entityType.properties[key].role === AggregationRole.measure)
//         .map((key) => {
//           const property = entityType.properties[key]
//           return {
//             label: `${property.label} (${property.name})`,
//             value: property.name,
//           }
//         })
// }

// /**
//  * @deprecated
//  */
// export function generateHierarchyListSchema(entityType: EntityType) {
//   return isNil(entityType?.properties)
//     ? []
//     : Object.keys(entityType.properties)
//         .filter(
//           (key) => entityType.semantics !== 'aggregate' ||
//             (entityType.properties[key].role === AggregationRole.dimension ||
//             entityType.properties[key].role === AggregationRole.hierarchy)
//         )
//         .map((key) => {
//           const property = entityType.properties[key]
//           return {
//             label: `${property.label} (${property.name})`,
//             value: property.name,
//           }
//         })
// }

// /**
//  * @deprecated
//  */
// export function generateDimensionListSchema(entityType: EntityType) {
//   return isNil(entityType?.properties)
//     ? []
//     : Object.keys(entityType.properties)
//         .filter(
//           (key) => entityType.semantics !== 'aggregate' ||
//             (entityType.properties[key].role === AggregationRole.dimension && // && isNil(entityType.properties[key].hierarchyNodeFor)
//             isNil(entityType.properties[key].hierarchyLevelFor))
//         )
//         .map((key) => {
//           const property = entityType.properties[key]
//           return {
//             label: `${property.label} (${property.name})`,
//             value: property.name,
//             property,
//             hierarchies: Object.keys(entityType.properties)
//               .filter(
//                 (name) =>
//                   entityType.properties[name].name === key ||
//                   entityType.properties[name].hierarchyNodeFor === key
//               )
//               .map((key) => {
//                 const property = entityType.properties[key]
//                 return {
//                   text: `${property.label} (${property.name})`,
//                   value: property.name,
//                 }
//               }),
//           }
//         })
// }

// /**
//  * @deprecated
//  */
// export function generateDimensionHierarchyLevelMeasureListSchema(entityType: EntityType) {
//   return [
//     ...generateDimensionHierarchyLevelListSchema(entityType),
//     ...generateMeasureListSchema(entityType),
//   ]
// }

// /**
//  * @deprecated
//  */
// export function generateFieldsListSchema(entityType: EntityType) {
//   return [...generateDimensionListSchema(entityType), ...generateMeasureListSchema(entityType)]
// }

// /**
//  * @deprecated
//  */
// export function generateEntitySetListSchema(entitySets: Array<EntitySet>) {
//   return entitySets
//     ?.map((entitySet) => ({
//       value: entitySet.name,
//       label: entitySet.entityType.label || entitySet.name,
//     }))
//     .sort((a, b) => a.value.localeCompare(b.value))
// }
