const rgb2hex = (value: string): string => {
  if (!value) {
    return value
  }

  const normalized = value.trim()
  if (normalized.startsWith('#')) {
    return normalized
  }

  const match = normalized.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) {
    return normalized
  }

  const [r, g, b] = match.slice(1, 4).map((channel) => {
    const parsed = Number(channel)
    return Math.max(0, Math.min(255, parsed))
  })

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export interface NxChromatics {
  [key: string]: NxChromatic
}

export interface NxChromatic {
  chromatic?: string
  chromaticName?: string
  dimensions?: NxChromaticDataDimensions
  selectedDim?: string
  selectedInterpolate?: NgmChromaticInterpolate
  reverse?: boolean
  selectedColor?: string
  domain?: [number, number]
}

export interface NxChromaticDataDimensions {
  [key: string]: NxChromaticDataDimension
}
export interface NxChromaticDataDimension {
  dimension: string
  dimensionName: string
  type?: NgmChromaticType
  domain?: Array<any>
}

export interface NgmChromaticInterpolate {
  name: string
  type?: NgmChromaticType
  interpolateFun: any
  colors?: string[]
}

export enum NgmChromaticType {
  single = 'Single', // 单个颜色
  sequential = 'Sequential', // 渐变颜色序列
  categorical = 'Categorical' // 一组类别颜色
}

export interface NgmChromaticInterpolateGroup {
  groupName: string
  type?: NgmChromaticType
  values: NgmChromaticInterpolate[]
}

export async function getScaleChromaticInterpolates(): Promise<NgmChromaticInterpolateGroup[]> {
  const {
    interpolateBrBG,
    interpolatePRGn,
    interpolatePiYG,
    interpolateSpectral,
    interpolateRdBu,
    interpolateRdGy,
    interpolateRdYlBu,
    interpolateRdYlGn,
    interpolatePuOr,
    interpolateBlues,
    interpolateGreens,
    interpolateGreys,
    interpolateOranges,
    interpolatePurples,
    interpolateReds,
    interpolateViridis,
    interpolateInferno,
    interpolateMagma,
    interpolatePlasma,
    interpolateWarm,
    interpolateCool,
    interpolateCubehelixDefault,
    interpolateBuGn,
    interpolateBuPu,
    interpolateGnBu,
    interpolateOrRd,
    interpolatePuBuGn,
    interpolatePuBu,
    interpolatePuRd,
    interpolateRdPu,
    interpolateYlGnBu,
    interpolateYlGn,
    interpolateYlOrBr,
    interpolateYlOrRd,
    interpolateRainbow,
    interpolateSinebow,
    schemeCategory10,
    schemeAccent,
    schemeDark2,
    schemePaired,
    schemePastel1,
    schemePastel2,
    schemeSet3,
    schemeSet1,
    schemeSet2
  } = await import('d3-scale-chromatic')

  return Object.values(
    {
      Categorical: {
        groupName: 'Categorical',
        type: NgmChromaticType.categorical,
        values: [
          {
            name: 'Category10',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeCategory10
          },
          {
            name: 'Accent',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeAccent
          },
          {
            name: 'Dark2',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeDark2
          },
          {
            name: 'Paired',
            type: NgmChromaticType.categorical,
            interpolateFun: schemePaired
          },
          {
            name: 'Pastel1',
            type: NgmChromaticType.categorical,
            interpolateFun: schemePastel1
          },
          {
            name: 'Pastel2',
            type: NgmChromaticType.categorical,
            interpolateFun: schemePastel2
          },
          {
            name: 'Set1',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeSet1
          },
          {
            name: 'Set2',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeSet2
          },
          {
            name: 'Set3',
            type: NgmChromaticType.categorical,
            interpolateFun: schemeSet3
          }
          // {
          //   name: 'Tableau10',
          //   interpolateFun: schemeTableau10
          // }
        ]
      },
      Diverging: {
        groupName: 'Diverging',
        values: [
          {
            name: 'BrBG',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateBrBG
          },
          {
            name: 'PRGn',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolatePRGn
          },
          {
            name: 'PiYG',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolatePiYG
          },
          {
            name: 'Spectral',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateSpectral
          },
          {
            name: 'RdBu',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateRdBu
          },
          {
            name: 'RdGy',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateRdGy
          },
          {
            name: 'RdYlBu',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateRdYlBu
          },
          {
            name: 'RdYlGn',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateRdYlGn
          },
          {
            name: 'PuOr',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolatePuOr
          }
        ]
      },
      SequentialSingleHue: {
        groupName: 'Sequential (Single Hue)',
        values: [
          {
            name: 'Blues',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateBlues
          },
          {
            name: 'Greens',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateGreens
          },
          {
            name: 'Greys',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateGreys
          },
          {
            name: 'Oranges',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateOranges
          },
          {
            name: 'Purples',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolatePurples
          },
          {
            name: 'Reds',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateReds
          }
        ]
      },
      SequentialMultiHue: {
        groupName: 'Sequential (Multi-Hue)',
        values: [
          {
            name: 'Viridis',
            type: NgmChromaticType.sequential,
            interpolateFun: interpolateViridis
          },
          {
            name: 'Inferno',
            interpolateFun: interpolateInferno
          },
          {
            name: 'Magma',
            interpolateFun: interpolateMagma
          },
          {
            name: 'Plasma',
            interpolateFun: interpolatePlasma
          },
          {
            name: 'Warm',
            interpolateFun: interpolateWarm
          },
          {
            name: 'Cool',
            interpolateFun: interpolateCool
          },
          {
            name: 'Cubehelix',
            interpolateFun: interpolateCubehelixDefault
          },
          {
            name: 'BuGn',
            interpolateFun: interpolateBuGn
          },
          {
            name: 'BuPu',
            interpolateFun: interpolateBuPu
          },
          {
            name: 'GnBu',
            interpolateFun: interpolateGnBu
          },
          {
            name: 'OrRd',
            interpolateFun: interpolateOrRd
          },
          {
            name: 'PuBuGn',
            interpolateFun: interpolatePuBuGn
          },
          {
            name: 'PuBu',
            interpolateFun: interpolatePuBu
          },
          {
            name: 'PuRd',
            interpolateFun: interpolatePuRd
          },
          {
            name: 'RdPu',
            interpolateFun: interpolateRdPu
          },
          {
            name: 'YlGnBu',
            interpolateFun: interpolateYlGnBu
          },
          {
            name: 'YlGn',
            interpolateFun: interpolateYlGn
          },
          {
            name: 'YlOrBr',
            interpolateFun: interpolateYlOrBr
          },
          {
            name: 'YlOrRd',
            interpolateFun: interpolateYlOrRd
          }
        ]
      },
      Cyclical: {
        groupName: 'Cyclical',
        values: [
          {
            name: 'Rainbow',
            interpolateFun: interpolateRainbow
          },
          {
            name: 'Sinebow',
            interpolateFun: interpolateSinebow
          }
        ]
      }
    }
  )
}

export async function previewChromaticInterpolate(interpolate: NgmChromaticInterpolate) {
  const { scaleOrdinal, scaleSequential } = await import('d3-scale')

  const myColorFun: any = (
    interpolate.type === 'Categorical'
      ? scaleOrdinal(interpolate.interpolateFun)
      : scaleSequential(interpolate.interpolateFun)
  ).domain([1, 10])

  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((data) => {
    return {
      fill: rgb2hex(myColorFun(data))
    }
  })
}
