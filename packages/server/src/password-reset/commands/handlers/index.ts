import { PasswordResetCreateHandler } from './password-reset.create.handler'
import { PasswordResetGetHandler } from './password-reset.get.handler'
import { PasswordResetApplyHandler } from './password-reset.apply.handler'

export const CommandHandlers = [PasswordResetCreateHandler, PasswordResetApplyHandler, PasswordResetGetHandler]
