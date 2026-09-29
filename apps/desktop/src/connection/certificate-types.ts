export type ConnectionUrlField = 'apiUrl' | 'webUrl' | 'frameUrl'
export type CertificateCheck = {
  origin: string | null
  fields: ConnectionUrlField[]
} & (
  | { status: 'untrusted'; reason: 'authority' | 'date' | 'hostname' | 'other' }
  | { status: 'trusted' | 'unreachable' | 'http' | 'invalid' }
)
