import { Injectable } from '@angular/core'
import { NgmCopilotEngineService } from '../services'

@Injectable({ providedIn: 'root' })
export class CopilotGlobalService {
  copilotEngine: NgmCopilotEngineService
}
