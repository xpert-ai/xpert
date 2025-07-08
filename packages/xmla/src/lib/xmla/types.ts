export interface Exception {
  type: 'error' | 'warning'
  code: number
  message: string
  data: any
  source?: string
}

export interface Request {
  requestType: string
  xhr: XMLHttpRequest
  exception: Exception
}
