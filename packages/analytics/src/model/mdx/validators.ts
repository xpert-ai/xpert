import { ChecklistItem, IModelRole, RuleValidator } from "@metad/contracts";
import { Cube, PropertyDimension, Schema, serializeUniqueName } from "@metad/ocap-core";

export class DimensionValidator implements RuleValidator {
  async validate(dimension: PropertyDimension, params: {schema: Schema}): Promise<ChecklistItem[]> {
    const issues: ChecklistItem[] = [
    ]

    if (dimension.hierarchies?.length) {
      if (!dimension.hierarchies.some(h => !h.name) && !dimension.defaultHierarchy) {
        issues.push({
          ruleCode: 'DIMENSION_MISSING_DEFAULT_HIERARCHY',
          field: 'dimension',
          value: dimension.name,
          message: {
            en_US: `Dimension "${dimension.name}" must have a default hierarchy or one hierarchy has no name`,
            zh_Hans: `维度 "${dimension.name}" 必须有默认层次结构或至少一个层次结构名称为空`
          },
          level: 'error'
        })
      }
    }
    return issues
  }
}

export class RoleValidator implements RuleValidator {
  async validate(role: IModelRole, params: {schema: Schema}): Promise<ChecklistItem[]> {
    const issues: ChecklistItem[] = [
    ]

    const schema = params.schema
    // cubeGrants
    for (const cubeGrant of role.options?.schemaGrant?.cubeGrants ?? []) {
      const cube = schema.cubes.find(c => c.name === cubeGrant.cube)
      if (!cube) {
        issues.push({
          ruleCode: 'CUBE_GRANT_MISSING_CUBE',
          field: 'cube',
          value: cubeGrant.cube,
          message: {
            en_US: `Cube grant for "${cubeGrant.cube}" does not exist in schema`,
            zh_Hans: `模型中不存在名为 "${cubeGrant.cube}" 的立方体`
          },
          level: 'error'
        })
        continue
      }
      // hierarchyGrants
      for (const hierarchyGrant of cubeGrant?.hierarchyGrants ?? []) {
        let hasHierarchy = false
        cube.dimensionUsages?.find((dimensionUsage) => {
          const dimensionName = dimensionUsage.name
          const sharedDimension = schema.dimensions?.find(d => d.name === dimensionUsage.source)
          if (sharedDimension) {
            return sharedDimension.hierarchies?.find((hierarchy) => {
              const hierarchyName = hierarchy.name
              if (serializeUniqueName(dimensionName, hierarchyName) === hierarchyGrant.hierarchy) {
                hasHierarchy = true
                return true
              }
            })
          }
        })
        
        if (!hasHierarchy) {
          cube.dimensions?.find((dimension) => {
            const dimensionName = dimension.name
            return dimension.hierarchies?.find((hierarchy) => {
              const hierarchyName = hierarchy.name
              if (serializeUniqueName(dimensionName, hierarchyName) === hierarchyGrant.hierarchy) {
                hasHierarchy = true
                return true
              }
            })
          })
        }
        if (!hasHierarchy) {
          issues.push({
            ruleCode: 'HIERARCHY_GRANT_MISSING_HIERARCHY',
            field: 'role',
            value: role.name,
            message: {
              en_US: `Hierarchy grant for "${hierarchyGrant.hierarchy}" does not exist in cube "${cube.name}"`,
              zh_Hans: `立方体 "${cube.name}" 中不存在技术名为 "${hierarchyGrant.hierarchy}" 的层次结构`
            },
            level: 'error'
          })
        }
      }
    }

    return issues
  }
}