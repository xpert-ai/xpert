import { FilterOperator, Drill, Cube, CalculatedMember } from '@metad/ocap-core'
import { mapMDXFilterToStatement, MDXHierarchyFilter } from './filter'
import { MDXDialect } from './types'

describe('mapMDXFilterToStatement', () => {
  const cube: Cube = {
    name: 'TestCube',
    calculatedMembers: [
      {
        name: 'CalcMember1',
        dimension: 'Dim1',
        hierarchy: '[Dim1].[H1]',
        formula: 'SomeFormula'
      } as CalculatedMember
    ]
  }

  it('should map BT (between) operator', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.BT,
      members: ['A', 'B']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toBe('[Dim1].[H1].[A]:[Dim1].[H1].[B]')
  })

  it('should map NE (not equal) operator', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.NE,
      members: ['A', 'B']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('Except')
    expect(result).toContain('Children')
    expect(result).toContain('[Dim1].[H1].[A]')
    expect(result).toContain('[Dim1].[H1].[B]')
  })

  it('should map Contains operator with MEMBER_CAPTION property', () => {
    const filter: MDXHierarchyFilter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.Contains,
      members: ['foo'],
      properties: ['MEMBER_CAPTION']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('Filter')
    expect(result).toContain('InStr([Dim1].[H1].CURRENTMEMBER.MEMBER_CAPTION, "foo") > 0')
  })

  it('should map Contains operator without MEMBER_CAPTION property', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.Contains,
      members: ['bar']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('Filter')
    expect(result).toContain('InStr([Dim1].[H1].CURRENTMEMBER.MEMBER_CAPTION, "bar") > 0')
  })

  it('should map StartsWith operator', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.StartsWith,
      members: ['abc']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toBe('Left([Dim1].[H1].CurrentMember.name, 3) = "abc"')
  })

  it('should map default operator with calculated member', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.EQ,
      members: ['CalcMember1']
    }
    const withMembers: Record<string, any> = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('[Dim1].[H1].[CalcMember1]')
    expect(Object.keys(withMembers).length).toBe(1)
    expect(Object.values(withMembers)[0]).toMatchObject({
      name: 'CalcMember1',
      dimension: 'Dim1',
      hierarchy: '[Dim1].[H1]',
      formula: 'SomeFormula'
    })
  })

  it('should map default operator with drill Children', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.EQ,
      members: ['A'],
      drill: Drill.Children
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('Descendants')
    expect(result).toContain('[Dim1].[H1].[A]')
  })

  it('should map default operator with drill SelfAndChildren', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.EQ,
      members: ['A'],
      drill: Drill.SelfAndChildren,
      distance: 2
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toContain('Descendants')
    expect(result).toContain('[Dim1].[H1].[A]')
    expect(result).toContain('SELF_AND_BEFORE')
  })

  it('should use SAPBW dialect for path', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: FilterOperator.BT,
      members: ['A', 'B']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter, cube, withMembers, MDXDialect.SAPBW)
    expect(result).toBe('[Dim1].[H1].[A]:[Dim1].[H1].[B]')
  })

  it('should return empty string for unknown operator', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      operator: 'UNKNOWN',
      members: []
    }
    const withMembers = {}
    // @ts-expect-error testing unknown operator
    const result = mapMDXFilterToStatement(filter, cube, withMembers)
    expect(result).toBe('')
  })

  it('should handle member with operator Contains when filter.operator is not set', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: [{ caption: 'foo', operator: FilterOperator.Contains }]
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('Filter')
    expect(result).toContain('InStr([Dim1].[H1].CurrentMember.Caption, "foo") > 0')
  })

  it('should handle member with operator StartsWith', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: [{ caption: 'foo', operator: FilterOperator.StartsWith }]
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('Filter')
    expect(result).toContain('Left([Dim1].[H1].CurrentMember.Caption, 3) = "foo"')
  })

  it('should handle member with operator EndsWith', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: [{ caption: 'foo', operator: FilterOperator.EndsWith }]
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('Filter')
    expect(result).toContain('Right([Dim1].[H1].CurrentMember.Caption, 3) = "foo"')
  })

  it('should handle member with operator Contains and filter.drill', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: [{ caption: 'foo', operator: FilterOperator.Contains }],
      drill: Drill.Children
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('Descendants')
    expect(result).toContain('Filter')
    expect(result).toContain('InStr([Dim1].[H1].CurrentMember.Caption, "foo") > 0')
  })

  it('should handle member as string when filter.operator is not set', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: ['A']
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('[Dim1].[H1].[A]')
  })

  it('should handle multiple members with mixed types when filter.operator is not set', () => {
    const filter = {
      hierarchy: '[Dim1].[H1]',
      members: [
        'A',
        { caption: 'bar', operator: FilterOperator.Contains }
      ]
    }
    const withMembers = {}
    const result = mapMDXFilterToStatement(filter as any, cube, withMembers)
    expect(result).toContain('[Dim1].[H1].[A]')
    expect(result).toContain('Filter')
    expect(result).toContain('InStr([Dim1].[H1].CurrentMember.Caption, "bar") > 0')
  })
})