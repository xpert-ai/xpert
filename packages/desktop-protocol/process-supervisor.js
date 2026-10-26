// Shared supervisor program; child protocol streams never count as exit evidence.
const AGENT_PROCESS_SUPERVISOR = String.raw`
import ctypes, errno, json, os, signal, subprocess, sys, time
owner = int(sys.argv[1])
stopping = False
strong = False
if sys.platform.startswith('linux'):
    strong = ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) == 0
def stop(*args):
    global stopping
    stopping = True
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
# The supervisor is the process-group leader. Its live PID reserves the group identity.
os.write(3, b'{"ready":true}\n')
try:
    if os.getppid() != owner: raise OSError('Original host exited before admission')
    child = subprocess.Popen(sys.argv[2:], close_fds=True)
except OSError:
    os.write(3, json.dumps({'version': 1, 'state': 'not_started', 'coverage': 'descendants', 'exitCode': 127}).encode())
    sys.exit(0)
# Only the protocol child owns stdin, so a closed transport still produces EPIPE.
os.close(0)
code = None
deadline = None
while True:
    if os.getppid() != owner: stopping = True
    if code is None:
        value = child.poll()
        if value is not None: code = value; stopping = True
    if stopping and deadline is None:
        deadline = time.monotonic() + 2
        os.killpg(os.getpgrp(), signal.SIGTERM)
    if deadline is not None and time.monotonic() >= deadline:
        if not strong:
            # No subreaper means escaped descendants cannot be certified. No receipt is emitted.
            os.killpg(os.getpgrp(), signal.SIGKILL)
        # Kill only still-waitable direct children. Orphans are adopted by this subreaper;
        # holding them until waitpid prevents PID reuse between selection and signalling.
        try:
            ids = open('/proc/self/task/' + str(os.getpid()) + '/children').read().split()
            for value in ids:
                try: os.kill(int(value), signal.SIGKILL)
                except ProcessLookupError: pass
        except OSError:
            os.killpg(os.getpgrp(), signal.SIGKILL)
    if stopping and strong:
        empty = False
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
                if pid == 0: break
                if pid == child.pid and code is None: code = os.waitstatus_to_exitcode(status)
            except ChildProcessError:
                empty = True
                break
        if empty:
            os.write(3, json.dumps({'version': 1, 'state': 'exited', 'coverage': 'descendants', 'exitCode': code}).encode())
            sys.exit(0)
    time.sleep(.02)
`
module.exports = { AGENT_PROCESS_SUPERVISOR }
