const palette = {
  primary: '#546e7a',
  success: '#00d68f',
  info: '#0095ff',
  warning: '#ffaa00',
  danger: '#ff3d71',
}

const theme = {
  fontMain: 'Lato, Open Sans, sans-serif',
  fontSecondary: 'Raleway, sans-serif',

  bg: '#ffffff',
  bg2: '#f7f9fc',
  bg3: '#edf1f7',
  bg4: '#e4e9f2',

  border: '#ffffff',
  border2: '#f7f9fc',
  border3: '#edf1f7',
  border4: '#e4e9f2',
  border5: '#c5cee0',

  fg: '#8f9bb3',
  fgHeading: '#1a2138',
  fgText: '#1a2138',
  fgHighlight: palette.primary,
  layoutBg: '#f7f9fc',
  separator: '#edf1f7',

  primary: palette.primary,
  success: palette.success,
  info: palette.info,
  warning: palette.warning,
  danger: palette.danger,

  primaryLight: '#598bff',
  successLight: '#2ce69b',
  infoLight: '#42aaff',
  warningLight: '#ffc94d',
  dangerLight: '#ff708d',

  chartLabelFontColor: '#999999',
  chartLabelFontSize: '14',
}

const chartTheme = {
  color: [
    theme.primary,
    theme.success,
    theme.info,
    theme.warning,
    theme.danger,
    theme.primaryLight,
    theme.successLight,
    theme.infoLight,
    theme.warningLight,
    theme.dangerLight,
  ],
  textStyle: {
    color: theme.chartLabelFontColor,
    fontSize: theme.chartLabelFontSize,
    fontFamily: theme.fontMain,
  },
  title: {
    textStyle: {
      color: '#666666',
    },
    subtextStyle: {
      color: '#999999',
    },
  },
  line: {
    itemStyle: {
      normal: {
        borderWidth: '2',
      },
    },
    lineStyle: {
      normal: {
        width: '3',
      },
    },
    symbolSize: '8',
    symbol: 'emptyCircle',
    smooth: false,
  },
  radar: {
    itemStyle: {
      normal: {
        borderWidth: '2',
      },
    },
    lineStyle: {
      normal: {
        width: '3',
      },
    },
    symbolSize: '8',
    symbol: 'emptyCircle',
    smooth: false,
  },
  bar: {
    itemStyle: {
      normal: {
        barBorderWidth: 0,
        barBorderColor: '#ccc',
      },
      emphasis: {
        barBorderWidth: 0,
        barBorderColor: '#ccc',
      },
    },
  },
  pie: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  scatter: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  boxplot: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  parallel: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  sankey: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
    label: {
      color: theme.chartLabelFontColor,
    },
  },
  funnel: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  gauge: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
      emphasis: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
  },
  candlestick: {
    itemStyle: {
      normal: {
        color: '#d0648a',
        color0: 'transparent',
        borderColor: '#d0648a',
        borderColor0: '#22c3aa',
        borderWidth: '1',
      },
    },
  },
  graph: {
    itemStyle: {
      normal: {
        borderWidth: 0,
        borderColor: '#ccc',
      },
    },
    lineStyle: {
      normal: {
        width: '1',
        color: '#cccccc',
      },
    },
    symbolSize: '8',
    symbol: 'emptyCircle',
    smooth: false,
    color: ['#4ea397', '#22c3aa', '#7bd9a5', '#d0648a', '#f58db2', '#f2b3c9'],
    label: {
      normal: {
        textStyle: {
          color: '#ffffff',
        },
      },
    },
  },
  map: {
    itemStyle: {
      normal: {
        areaColor: '#eeeeee',
        borderColor: '#999999',
        borderWidth: 0.5,
      },
      emphasis: {
        areaColor: 'rgba(34,195,170,0.25)',
        borderColor: '#22c3aa',
        borderWidth: 1,
      },
    },
    label: {
      normal: {
        textStyle: {
          color: '#28544e',
        },
      },
      emphasis: {
        textStyle: {
          color: 'rgb(52,158,142)',
        },
      },
    },
  },
  geo: {
    itemStyle: {
      normal: {
        areaColor: theme.bg3,
        borderColor: theme.border4,
        borderWidth: 1,
      },
      emphasis: {
        areaColor: theme.primaryLight,
        borderColor: theme.primary,
        borderWidth: 1,
      },
    },
    label: {
      normal: {
        textStyle: {
          color: theme.fgText,
        },
      },
      emphasis: {
        textStyle: {
          color: theme.fgText,
        },
      },
    },
  },
  grid: {
    top: 30,
    left: 5,
    right: 5,
    bottom: 5
  },
  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cccccc',
        width: 2
      },
    },
    axisTick: {
      show: false,
      lineStyle: {
        color: '#333',
      },
    },
    axisLabel: {
      show: true,
      textStyle: {
        color: '#999999',
        fontSize: theme.chartLabelFontSize,
      },
    },
    splitLine: {
      show: false,
      lineStyle: {
        color: ['#eeeeee'],
      },
    },
    splitArea: {
      show: false,
      areaStyle: {
        color: ['rgba(250,250,250,0.05)', 'rgba(200,200,200,0.02)'],
      },
    },
  },
  valueAxis: {
    axisLine: {
      show: false,
      lineStyle: {
        color: '#cccccc',
      },
    },
    axisTick: {
      show: false,
      lineStyle: {
        color: '#333',
      },
    },
    axisLabel: {
      show: true,
      textStyle: {
        color: '#999999',
        fontSize: theme.chartLabelFontSize,
      },
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: ['#eeeeee'],
        type: 'dotted'
      },
    },
    splitArea: {
      show: false,
      areaStyle: {
        color: ['rgba(250,250,250,0.05)', 'rgba(200,200,200,0.02)'],
      },
    },
  },
  logAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cccccc',
      },
    },
    axisTick: {
      show: false,
      lineStyle: {
        color: '#333',
      },
    },
    axisLabel: {
      show: true,
      textStyle: {
        color: '#999999',
        fontSize: theme.chartLabelFontSize,
      },
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: ['#eeeeee'],
      },
    },
    splitArea: {
      show: false,
      areaStyle: {
        color: ['rgba(250,250,250,0.05)', 'rgba(200,200,200,0.02)'],
      },
    },
  },
  timeAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: '#cccccc',
      },
    },
    axisTick: {
      show: false,
      lineStyle: {
        color: '#333',
      },
    },
    axisLabel: {
      show: true,
      textStyle: {
        color: '#999999',
        fontSize: theme.chartLabelFontSize,
      },
    },
    splitLine: {
      show: false,
      lineStyle: {
        color: ['#eeeeee'],
      },
    },
    splitArea: {
      show: false,
      areaStyle: {
        color: ['rgba(250,250,250,0.05)', 'rgba(200,200,200,0.02)'],
      },
    },
    // shadow 类型的 axisPointer 对 timeAxis 不起作用?
    // axisPointer: {
    //   show: true,
    //   type: 'shadow'
    // }
  },
  toolbox: {
    iconStyle: {
      normal: {
        borderColor: '#999999',
      },
      emphasis: {
        borderColor: '#666666',
      },
    },
  },
  legend: {
    textStyle: {
      color: '#999999',
    },
    pageIconColor: theme.fg,
    pageIconInactiveColor: theme.bg2,
    pageTextStyle: {
      color: theme.fg,
    },
  },
  tooltip: {
    backgroundColor: theme.bg2,
    textStyle: {
      color: theme.fgText,
    },
    extraCssText: `box-shadow: 0px 2px 46px 0 ${theme.primaryLight + '65'};`,
    axisPointer: {
      lineStyle: {
        color: '#cccccc',
        width: 1,
      },
      crossStyle: {
        color: '#cccccc',
        width: 1,
      },
      shadowStyle: {
        color: theme.fg,
        opacity: 0.3
      }
    },
  },
  timeline: {
    lineStyle: {
      color: '#4ea397',
      width: 1,
    },
    itemStyle: {
      normal: {
        color: '#4ea397',
        borderWidth: 1,
      },
      emphasis: {
        color: '#4ea397',
      },
    },
    controlStyle: {
      normal: {
        color: '#4ea397',
        borderColor: '#4ea397',
        borderWidth: 0.5,
      },
      emphasis: {
        color: '#4ea397',
        borderColor: '#4ea397',
        borderWidth: 0.5,
      },
    },
    checkpointStyle: {
      color: '#4ea397',
      borderColor: 'rgba(60,235,210,0.3)',
    },
    label: {
      normal: {
        textStyle: {
          color: '#4ea397',
        },
      },
      emphasis: {
        textStyle: {
          color: '#4ea397',
        },
      },
    },
  },
  visualMap: {
    color: ['#d0648a', '#22c3aa', '#adfff1'],
  },
  dataZoom: {
    backgroundColor: 'rgba(255,255,255,0)',
    dataBackgroundColor: 'rgba(222,222,222,1)',
    fillerColor: 'rgba(114,230,212,0.25)',
    handleColor: '#cccccc',
    handleSize: '100%',
    textStyle: {
      color: '#999999',
    },
  },
  markPoint: {
    label: {
      normal: {
        textStyle: {
          color: '#ffffff',
        },
      },
      emphasis: {
        textStyle: {
          color: '#ffffff',
        },
      },
    },
  },
}

const g2Theme = {
  backgroundStyle: {
    fill: 'unset',
  },
  defaultColor: theme.primary,
  components: {
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          backgroundColor: theme.bg2,
          boxShadow: `0px 2px 46px 0 ${theme.primaryLight + '65'}`,
        },
      },
    },
  }
}

export const DEFAULT_THEME = {
  name: 'default',
  g2Theme,
  chartTheme,
}
