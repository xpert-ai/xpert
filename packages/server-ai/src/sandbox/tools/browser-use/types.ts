import { ICopilotModel } from "@metad/contracts"

export enum BrowserUseToolEnum {
    TASK = 'browser_use_task',
    NAVIGATE = 'browser_use_navigate',
    CLICK = 'browser_use_click',
}

export type TBrowserUseToolCredentials = {
    copilotModel: ICopilotModel
    max_steps?: number
    llm_temperature?: number
    enable_recording?: boolean
    use_vision?: boolean
    restrictions?: string
}

export type TBrowserUseEvent = {
    url: string
    screenshot: string
    thoughts: string
    final_result: string
    errors: string
}