import { scaleOrdinal, scaleSequential } from 'd3-scale'
import {
  interpolateBlues,
  interpolateBrBG,
  interpolateBuGn,
  interpolateBuPu,
  interpolateCool,
  interpolateCubehelixDefault,
  interpolateGnBu,
  interpolateGreens,
  interpolateGreys,
  interpolateInferno,
  interpolateMagma,
  interpolateOranges,
  interpolateOrRd,
  interpolatePiYG,
  interpolatePlasma,
  interpolatePRGn,
  interpolatePuBu,
  interpolatePuBuGn,
  interpolatePuOr,
  interpolatePuRd,
  interpolatePurples,
  interpolateRainbow,
  interpolateRdBu,
  interpolateRdGy,
  interpolateRdPu,
  interpolateRdYlBu,
  interpolateRdYlGn,
  interpolateReds,
  interpolateSinebow,
  interpolateSpectral,
  interpolateViridis,
  interpolateWarm,
  interpolateYlGn,
  interpolateYlGnBu,
  interpolateYlOrBr,
  interpolateYlOrRd,
  schemeAccent,
  schemeCategory10,
  schemeDark2,
  schemePaired,
  schemePastel1,
  schemePastel2,
  schemeSet1,
  schemeSet2,
  schemeSet3
} from 'd3-scale-chromatic'

export enum NxChromaticType {
  Single = 'Single', // 单个颜色
  Sequential = 'Sequential', // 渐变颜色序列
  Categorical = 'Categorical' // 一组类别颜色
}

export interface ColorScheme {
  group?: string
  name: string
  type: NxChromaticType
  value: any
}

/**
 * @deprecated use preview 'colors' attribute in measure instead
 * 
 * @param name 
 * @param domain 
 * @param reverse 
 * @returns 
 */
export function getChromaticScale(name: string, domain: number[], reverse?: boolean): (t: number) => string {
  const colorScheme = CHROMATICS?.find((item) => item.useValue.name === name)?.useValue as ColorScheme
  if (!colorScheme) {
    throw new Error(`Can't find colorScheme for name '${name}'`)
  }

  let scaleFun = null
  if (colorScheme.type === NxChromaticType.Categorical) {
    scaleFun = reverse ? scaleOrdinal(Array.from(colorScheme.value).reverse()) : scaleOrdinal(colorScheme.value)
  } else {
    scaleFun = scaleSequential(reverse ? (t) => colorScheme.value(1 - t) : colorScheme.value)
  }

  if (domain) {
    return scaleFun.domain(domain)
  }
  return scaleFun
}

export const NX_COLOR_CHROMATIC = 1

/**
 * @deprecated use preview 'colors' attribute in measure instead
 */
export const CHROMATICS = [
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Category10',
      type: NxChromaticType.Categorical,
      value: schemeCategory10
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Accent',
      type: NxChromaticType.Categorical,
      value: schemeAccent
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Dark2',
      type: NxChromaticType.Categorical,
      value: schemeDark2
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Paired',
      type: NxChromaticType.Categorical,
      value: schemePaired
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Pastel1',
      type: NxChromaticType.Categorical,
      value: schemePastel1
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Pastel2',
      type: NxChromaticType.Categorical,
      value: schemePastel2
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Set1',
      type: NxChromaticType.Categorical,
      value: schemeSet1
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Set2',
      type: NxChromaticType.Categorical,
      value: schemeSet2
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Categorical',
      name: 'Set3',
      type: NxChromaticType.Categorical,
      value: schemeSet3
    },
    multi: true
  },
  // {
  //   provide: NX_CHROMATICS,
  //   useValue: {
  //     group: 'Categorical',
  //     name: 'Tableau10',
  //   value: schemeTableau10
  // }
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'BrBG',
      type: NxChromaticType.Sequential,
      value: interpolateBrBG
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'PRGn',
      type: NxChromaticType.Sequential,
      value: interpolatePRGn
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'PiYG',
      type: NxChromaticType.Sequential,
      value: interpolatePiYG
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'Spectral',
      type: NxChromaticType.Sequential,
      value: interpolateSpectral
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'RdBu',
      type: NxChromaticType.Sequential,
      value: interpolateRdBu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'RdGy',
      type: NxChromaticType.Sequential,
      value: interpolateRdGy
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'RdYlBu',
      type: NxChromaticType.Sequential,
      value: interpolateRdYlBu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'RdYlGn',
      type: NxChromaticType.Sequential,
      value: interpolateRdYlGn
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Diverging',
      name: 'PuOr',
      type: NxChromaticType.Sequential,
      value: interpolatePuOr
    },
    multi: true
  },

  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Blues',
      type: NxChromaticType.Sequential,
      value: interpolateBlues
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Greens',
      type: NxChromaticType.Sequential,
      value: interpolateGreens
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Greys',
      type: NxChromaticType.Sequential,
      value: interpolateGreys
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Oranges',
      type: NxChromaticType.Sequential,
      value: interpolateOranges
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Purples',
      type: NxChromaticType.Sequential,
      value: interpolatePurples
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Single Hue)',
      name: 'Reds',
      type: NxChromaticType.Sequential,
      value: interpolateReds
    },
    multi: true
  },

  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Viridis',
      type: NxChromaticType.Sequential,
      value: interpolateViridis
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Inferno',
      type: NxChromaticType.Sequential,
      value: interpolateInferno
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Magma',
      type: NxChromaticType.Sequential,
      value: interpolateMagma
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Plasma',
      type: NxChromaticType.Sequential,
      value: interpolatePlasma
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Warm',
      type: NxChromaticType.Sequential,
      value: interpolateWarm
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Cool',
      type: NxChromaticType.Sequential,
      value: interpolateCool
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'Cubehelix',
      type: NxChromaticType.Sequential,
      value: interpolateCubehelixDefault
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'BuGn',
      type: NxChromaticType.Sequential,
      value: interpolateBuGn
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'BuPu',
      type: NxChromaticType.Sequential,
      value: interpolateBuPu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'GnBu',
      type: NxChromaticType.Sequential,
      value: interpolateGnBu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'OrRd',
      type: NxChromaticType.Sequential,
      value: interpolateOrRd
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'PuBuGn',
      type: NxChromaticType.Sequential,
      value: interpolatePuBuGn
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'PuBu',
      type: NxChromaticType.Sequential,
      value: interpolatePuBu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'PuRd',
      type: NxChromaticType.Sequential,
      value: interpolatePuRd
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'RdPu',
      type: NxChromaticType.Sequential,
      value: interpolateRdPu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'YlGnBu',
      type: NxChromaticType.Sequential,
      value: interpolateYlGnBu
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'YlGn',
      type: NxChromaticType.Sequential,
      value: interpolateYlGn
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'YlOrBr',
      type: NxChromaticType.Sequential,
      value: interpolateYlOrBr
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Sequential (Multi-Hue)',
      name: 'YlOrRd',
      type: NxChromaticType.Sequential,
      value: interpolateYlOrRd
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Cyclical',
      name: 'Rainbow',
      value: interpolateRainbow
    },
    multi: true
  },
  {
    provide: NX_COLOR_CHROMATIC,
    useValue: {
      group: 'Cyclical',
      name: 'Sinebow',
      value: interpolateSinebow
    },
    multi: true
  }
]
