import { AuthLoginHandler } from './auth.login.handler'
import { AuthRegisterHandler } from './auth.register.handler'
import { AuthRegisterTrialHandler } from './auth.trial.handler'

export const CommandHandlers = [
	AuthRegisterHandler,
	AuthLoginHandler,
	AuthRegisterTrialHandler,
]
