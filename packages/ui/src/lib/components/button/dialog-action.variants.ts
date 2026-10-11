import { cva } from 'class-variance-authority'

// Dialog geometry belongs to shared semantic regions, never individual action buttons.
// Cloud uses a 14px root font; pixel tokens keep targets independent of page density.
const standardActionHeight = 'h-[36px] min-h-[36px]'

export const dialogActionVariants = cva(
  'relative rounded-[8px] gap-[6px] text-[14px] leading-[20px] [&_z-icon]:size-[16px] [&_ng-icon]:size-[16px] [&_svg]:size-[16px] [&_i]:text-[16px] [&_i]:leading-none pointer-coarse:h-[44px] pointer-coarse:min-h-[44px]',
  {
    variants: {
      purpose: {
        standard: standardActionHeight,
        workflow: 'h-[40px] min-h-[40px]'
      },
      icon: {
        false: 'px-[10px]',
        true: 'w-[36px] min-w-[36px] px-0 pointer-coarse:w-[44px] pointer-coarse:min-w-[44px]'
      }
    },
    compoundVariants: [{ purpose: 'workflow', icon: true, class: 'w-[40px] min-w-[40px]' }]
  }
)

export type { XpDialogActionRole } from '../dialog/dialog-context'
