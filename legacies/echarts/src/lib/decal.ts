
export function DecalPatterns() {
  return [
    {
      dashArrayX: [
        [6, 6],
        [0, 6, 6, 0]
      ],
      dashArrayY: [6, 0],
      symbol: 'rect',
      symbolSize: 1
    },
    {
      symbol: 'circle',
      dashArrayX: [
        [8, 8],
        [0, 8, 8, 0]
      ],
      dashArrayY: [6, 0],
      symbolSize: 1
    },
    {
      dashArrayY: [2, 5],
      rotation: -0.785
    },
    {
      dashArrayY: [2, 5],
      rotation: 0.5
    },
    {
      dashArrayX: [1, 0],
      dashArrayY: [4, 3],
      rotation: -0.785,
      symbol: 'rect',
      symbolSize: 1
    },
    {
      dashArrayX: [1, 0],
      dashArrayY: [4, 3],
      rotation: 0.5,
      symbol: 'rect',
      symbolSize: 1
    },
    {
      dashArrayX: [
        [1, 0],
        [1, 6]
      ],
      dashArrayY: [1, 0, 6, 0],
      symbol: 'rect',
      symbolSize: 1,
      symbolKeepAspect: true,
      rotation: 0.785
    },
    {
      dashArrayX: [
        [9, 9],
        [0, 9, 9, 0]
      ],
      dashArrayY: [7, 2],
      symbol: 'triangle',
      symbolSize: 0.75,
      symbolKeepAspect: true,
      rotation: 0
    }
  ]
}
