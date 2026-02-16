import { ChartTypeEnum as NxChartType } from '@metad/ocap-core'

export const CHART_TYPE_ICONS = {
  [NxChartType.Pie]: {
    '': 'pie',
    Doughnut: 'donut',
    Nightingale: 'donut'
  },
  [NxChartType.Bar]: {}
}

export const CHART_TYPES = [
  {
    name: 'Comparison',
    disabled: false,
    charts: [
      {
        value: NxChartType.Pie,
        label: 'Pie',
        icon: 'pie'
      },
      {
        value: NxChartType.Bar,
        label: 'Bar',
        icon: 'column'
      },

      // {
      //   value: NxChartType.Column,
      //   label: 'Column',
      //   icon: 'column'
      // },
      // {
      //   value: NxChartType.BarStacked,
      //   label: 'Stacked Bar',
      //   icon: 'stacked-bar'
      // },
      // {
      //   value: NxChartType.BarStacked100,
      //   label: 'Stacked Bar 100%',
      //   icon: 'stacked-bar'
      // },
      // {
      //   value: NxChartType.ColumnStacked,
      //   label: 'Stacked Column',
      //   icon: 'stacked-column'
      // },
      // {
      //   value: NxChartType.ColumnStacked100,
      //   label: 'Stacked Column 100%',
      //   icon: 'stacked-column'
      // },
      // {
      //   value: NxChartType.Combination,
      //   label: 'Combination',
      //   icon: 'combination'
      // },
      // {
      //   value: NxChartType.CombinationStacked,
      //   label: 'Combination Stacked',
      //   icon: 'combination-stacked'
      // },
      {
        value: NxChartType.Waterfall,
        label: 'Waterfall',
        icon: 'waterfall'
      },
      // {
      //   value: 'Histogram',
      //   label: 'Histogram',
      //   icon: 'histogram'
      // }
    ]
  },
  {
    name: 'Trend',
    disabled: false,
    charts: [
      {
        value: NxChartType.Line,
        label: 'Line',
        icon: 'line'
      },
      // {
      //   value: NxChartType.Area,
      //   label: 'Area',
      //   icon: 'area'
      // },
      {
        value: NxChartType.ThemeRiver,
        label: 'Theme River',
        icon: 'area'
      }
    ]
  },
  {
    name: 'Correlation',
    disabled: false,
    charts: [
      {
        value: NxChartType.Scatter,
        label: 'Scatterplot',
        icon: 'scatter'
      },
      // {
      //   value: NxChartType.Bubble,
      //   label: 'Bubble',
      //   icon: 'bubble'
      // },
      // {
      //   value: 'ClusterBubble',
      //   label: 'Cluster Bubble',
      //   icon: 'cluster-bubble'
      // },
      // {
      //   value: 'PackedBubble',
      //   label: 'Packed Bubble',
      //   icon: 'packed-bubble'
      // },
      // {
      //   value: NxChartType.RadialScatter,
      //   label: 'Radial Scatter',
      //   icon: 'scatter'
      // }
    ]
  },
  {
    name: 'Distribution',
    disabled: false,
    charts: [
      {
        value: NxChartType.Boxplot,
        label: 'Box plot',
        icon: 'boxplot'
      },
      {
        value: NxChartType.Heatmap,
        label: 'Heat Map',
        icon: 'heat-map'
      },
      // {
      //   value: NxChartType.Histogram,
      //   label: 'Histogram',
      //   icon: 'histogram'
      // },
      {
        value: NxChartType.Tree,
        label: 'Tree',
        icon: 'tree'
      },
      {
        value: NxChartType.Treemap,
        label: 'Tree Map',
        icon: 'tree-map'
      },
      {
        value: NxChartType.Sunburst,
        label: 'Sunburst',
        icon: 'sunburst'
      },
      {
        value: NxChartType.Sankey,
        label: 'Sankey',
        icon: 'sankey'
      },
      {
        value: NxChartType.Funnel,
        label: 'Funnel',
        icon: 'funnel'
      },
      // {
      //   value: NxChartType.Radar,
      //   label: 'Radar',
      //   icon: 'radar'
      // }
    ]
  },
  {
    name: 'Geo',
    charts: [
      {
        value: NxChartType.GeoMap,
        label: 'GeoMap',
        icon: 'earth'
      }
    ]
  },
  // {
  //   name: 'Indicator',
  //   disabled: false,
  //   charts: [
  //     {
  //       value: NxChartType.Bullet,
  //       label: 'Bullet',
  //       icon: 'bullet'
  //     },
  //     // {
  //     //   value: NxChartType.NumericPoint,
  //     //   label: 'NumericPoint',
  //     //   icon: 'NumericPoint'
  //     // },
  //     {
  //       value: 'Gauge',
  //       label: 'Gauge',
  //       icon: 'gauge'
  //     }
  //   ]
  // },
  {
    name: '3D',
    charts: [
      {
        value: 'Bar3D',
        label: 'Bar 3D',
        icon: 'gl'
      },
      {
        value: 'Line3D',
        label: 'Line 3D',
        icon: 'gl'
      },
      {
        value: 'Scatter3D',
        label: 'Scatter 3D',
        icon: 'gl'
      }
    ]
  },

  {
    name: 'Custom',
    charts: [
      {
        value: 'Custom',
        label: 'Custom',
        icon: 'custom'
      },
    ]
  }

  // {
  //   name: 'Antv G2',
  //   disabled: false,
  //   charts: [
  //     {
  //       value: `antv-g2-${NxChartType.Bar}`,
  //       label: 'Bar',
  //       icon: 'bar'
  //     }
  //   ]
  // }
]

export const GeoProjections = [
  'NaturalEarth1',
  'NaturalEarth2',
  'Airy',
  'Aitoff',
  'Albers',
  'AlbersUsa',
  'Armadillo',
  'August',
  'AzimuthalEqualArea',
  'AzimuthalEquidistant',
  'Baker',
  'Berghaus',
  'Bertin1953',
  'Boggs',
  'Bonne',
  'Bottomley',
  'Bromley',
  'Chamberlin',
  'Collignon',
  'ConicConformal',
  'ConicEqualArea',
  'ConicEquidistant',
  'Craig',
  'Craster',
  'CylindricalEqualArea',
  'CylindricalStereographic',
  'Eckert1',
  'Eckert2',
  'Eckert3',
  'Eckert4',
  'Eckert5',
  'Eckert6',
  'Eisenlohr',
  'Equirectangular',
  'Fahey',
  'Foucaut',
  'FoucautSinusoidal',
  'Gilbert',
  'Gingery',
  'Ginzburg4',
  'Ginzburg5',
  'Ginzburg6',
  'Ginzburg8',
  'Ginzburg9',
  'Gnomonic',
  'Gringorten',
  'Guyou',
  'Hammer',
  'HammerRetroazimuthal',
  'Healpix',
  'Hill',
  'Homolosine',
  'Hufnagel',
  'Hyperelliptical',
  'Kavrayskiy7',
  'Lagrange',
  'Larrivee',
  'Laskowski',
  'Littrow',
  'Loximuthal',
  'Mercator',
  'Miller',
  'ModifiedStereographic',
  'ModifiedStereographicAlaska',
  'ModifiedStereographicGs48',
  'ModifiedStereographicGs50',
  'ModifiedStereographicMiller',
  'ModifiedStereographicLee',
  'Mollweide',
  'MtFlatPolarParabolic',
  'MtFlatPolarQuartic',
  'MtFlatPolarSinusoidal',
  'NellHammer',
  'Nicolosi',
  'Orthographic',
  'Patterson',
  'Polyconic',
  'RectangularPolyconic',
  'Robinson',
  'Satellite',
  'Sinusoidal',
  'SinuMollweide',
  'Stereographic',
  'Times',
  'TransverseMercator',
  'TwoPointAzimuthalUsa',
  'TwoPointEquidistantUsa',
  'VanDerGrinten',
  'VanDerGrinten2',
  'VanDerGrinten3',
  'VanDerGrinten4',
  'Wagner',
  'Wagner4',
  'Wagner6',
  'Wagner7',
  'Wiechel',
  'Winkel3',
  // Interrupted Projections
  'Interrupt',
  'InterruptedHomolosine',
  'InterruptedSinusoidal',
  'InterruptedBoggs',
  'InterruptedSinuMollweide',
  'InterruptedMollweide',
  'InterruptedMollweideHemispheres',
  'InterruptedQuarticAuthalic',
  // Polyhedral Projections
  // 'Polyhedral',
  'PolyhedralButterfly',
  'PolyhedralCollignon',
  'PolyhedralWaterman',
  // Quincuncial Projections
  // 'Quincuncial',
  'GringortenQuincuncial',
  'PeirceQuincuncial'
]
