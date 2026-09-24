import { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

export const fileSnapshotSchema = z.object({
    path: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
    text: z.string().optional()
})
const snapshotSchema = z.object({ files: z.array(fileSnapshotSchema), skipped: z.number(), complete: z.boolean() })
export type FileSnapshot = { path: string; sha256: string; size: number; text?: string }
export type WorkspaceSnapshot = { files: FileSnapshot[]; skipped: number; complete: boolean }
export const MAX_DELIVERY_FILE_BYTES = 25 * 1024 * 1024

export function workspaceRelativePath(path: string): string {
    if (
        !path ||
        path.includes('\0') ||
        path.includes('\\') ||
        path.startsWith('/') ||
        /^[a-z]:/i.test(path) ||
        path.split('/').some((part) => part === '..') ||
        path.split('/').includes('.xpert')
    ) {
        throw new Error('Use a workspace-relative file path without parent traversal or internal directories.')
    }
    const normalized = path
        .split('/')
        .filter((part) => part && part !== '.')
        .join('/')
    if (!normalized) throw new Error('A file path is required.')
    return normalized
}
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'"

/** Runs inside the selected sandbox, never against the API server filesystem. No symlink traversal. */
export async function snapshotWorkspace(
    backend: Pick<SandboxBackendProtocol, 'execute' | 'workingDirectory'>,
    path?: string
): Promise<WorkspaceSnapshot> {
    const script = String.raw`
import os,sys,json,hashlib,stat
root=os.path.realpath(sys.argv[1]); target=sys.argv[2]; files=[]; skipped=0; complete=True; used=0; text_used=0
ignored={'.git','node_modules','.venv','venv','__pycache__','.xpert','.cache'}
def scan_error(error):
 global skipped,complete
 skipped+=1;complete=False
def inspect(rel):
 global skipped,complete,used,text_used
 p=os.path.join(root,rel)
 try:
  if os.path.commonpath([root,os.path.realpath(p)]) != root: raise ValueError('path')
  cursor=root
  for part in rel.split(os.sep):
   cursor=os.path.join(cursor,part)
   if os.path.islink(cursor): raise ValueError('symlink')
  st=os.lstat(p)
  if not stat.S_ISREG(st.st_mode): raise ValueError('type')
  if st.st_size>26214400 or used+st.st_size>67108864 or len(files)>=256:
   skipped+=1;complete=False;return
  fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
  with os.fdopen(fd,'rb') as f:
   data=f.read(26214401); end=os.fstat(f.fileno())
  if len(data)>26214400 or (st.st_ino,st.st_mtime_ns,st.st_size)!=(end.st_ino,end.st_mtime_ns,end.st_size): raise ValueError('changed')
  used+=len(data); item={'path':rel,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
  if len(data)<=32768 and text_used+len(data)<=131072 and b'\0' not in data:
   try: item['text']=data.decode('utf-8');text_used+=len(data)
   except UnicodeDecodeError: pass
  files.append(item)
 except FileNotFoundError:
  if target: return
  skipped+=1;complete=False
 except (OSError,ValueError): skipped+=1;complete=False
if target:
 inspect(target)
else:
 for base,dirs,names in os.walk(root,followlinks=False,onerror=scan_error):
  dirs[:]=sorted(d for d in dirs if d not in ignored and not os.path.islink(os.path.join(base,d)))
  for name in sorted(names): inspect(os.path.relpath(os.path.join(base,name),root))
  if len(files)>=256 or used>=67108864: complete=False;break
print(json.dumps({'files':files,'skipped':skipped,'complete':complete}))
`
    const result = await backend.execute(
        `python3 -c ${quote(script)} ${quote(backend.workingDirectory)} ${quote(path ? workspaceRelativePath(path) : '')}`,
        { timeoutMs: 15000, maxOutputBytes: 1024 * 1024 }
    )
    if (result.exitCode !== 0 || result.truncated || result.timedOut)
        throw new Error('Workspace change observation unavailable')
    return snapshotSchema.parse(JSON.parse(result.output)) as WorkspaceSnapshot
}
