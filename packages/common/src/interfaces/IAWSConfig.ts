export interface IAWSConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  endpoint?: string
  s3: {
    bucket: string
  }
}
