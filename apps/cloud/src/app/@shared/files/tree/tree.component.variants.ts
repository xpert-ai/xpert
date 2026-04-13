export const FILE_TREE_SIZE_PRESETS = {
  sm: {
    headerPadding: 'px-3 pt-3',
    bodyPadding: 'px-2 pb-2',
    listGap: 'gap-0',
    rowSpacing: 'gap-1.5 p-1',
    indentWidth: 'w-2.5',
    controlSize: 'h-5 w-5 text-sm',
    contentGap: 'gap-0.5',
    titleText: 'text-sm',
    subtitleText: 'text-xs',
    itemText: 'text-sm',
    emptyTitleText: 'text-base',
    emptyHintText: 'text-sm'
  },
  default: {
    headerPadding: 'px-4 pt-4',
    bodyPadding: 'px-3 pb-3',
    listGap: 'gap-1',
    rowSpacing: 'gap-2 px-2 py-2',
    indentWidth: 'w-3',
    controlSize: 'h-6 w-6 text-sm',
    contentGap: 'gap-2',
    titleText: 'text-sm',
    subtitleText: 'text-xs',
    itemText: 'text-sm',
    emptyTitleText: 'text-lg',
    emptyHintText: 'text-sm'
  },
  lg: {
    headerPadding: 'px-5 pt-5',
    bodyPadding: 'px-4 pb-4',
    listGap: 'gap-1.5',
    rowSpacing: 'gap-2.5 px-2.5 py-2.5',
    indentWidth: 'w-4',
    controlSize: 'h-7 w-7 text-base',
    contentGap: 'gap-2.5',
    titleText: 'text-base',
    subtitleText: 'text-sm',
    itemText: 'text-base',
    emptyTitleText: 'text-xl',
    emptyHintText: 'text-base'
  }
} as const

export type FileTreeSizeVariants = keyof typeof FILE_TREE_SIZE_PRESETS
export type FileTreeSizePreset = (typeof FILE_TREE_SIZE_PRESETS)[FileTreeSizeVariants]
