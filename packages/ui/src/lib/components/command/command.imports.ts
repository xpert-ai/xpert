import { ZardCommandDividerComponent } from './command-divider.component'
import { ZardCommandEmptyComponent } from './command-empty.component'
import { ZardCommandInputComponent } from './command-input.component'
import { ZardCommandListComponent } from './command-list.component'
import { ZardCommandOptionGroupComponent } from './command-option-group.component'
import { ZardCommandOptionComponent } from './command-option.component'
import { ZardCommandComponent } from './command.component'

export const ZardCommandImports = [
  ZardCommandComponent,
  ZardCommandInputComponent,
  ZardCommandListComponent,
  ZardCommandEmptyComponent,
  ZardCommandOptionComponent,
  ZardCommandOptionGroupComponent,
  ZardCommandDividerComponent
] as const
