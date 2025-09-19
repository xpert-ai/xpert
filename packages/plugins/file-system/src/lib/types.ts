export const FileSystem = 'file-system'

export interface FileSystemConfig {
  type: 'local' | 'ftp' | 'sftp' | 'smb' | 'webdav';
  filePath: string; // 本地路径 or 远程路径
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  https?: boolean; // webdav 用
  allowSelfSigned?: boolean; // 是否允许自签名证书
  skipForbidden?: boolean; // 是否跳过403错误
}
