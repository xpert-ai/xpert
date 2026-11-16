"""Small diagnostic events in existing logs; never a service owner or retry policy."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time

PREFIX = 'XPERT_DEV_PHASE '
PHASES = {'dependencies', 'terminal', 'verify_build', 'build', 'build_libraries',
          'build_api', 'build_local_shell', 'schema_baseline', 'schema_apply', 'schema_verify', 'serve'}


def emit(phase, status, elapsed_ms=0, stream=None):
    event = {'phase': phase, 'status': status,
             'at': datetime.now(timezone.utc).isoformat(), 'elapsedMs': round(elapsed_ms)}
    print(PREFIX + json.dumps(event), file=stream, flush=True)


@contextmanager
def phase(name, stream=None):
    started = time.monotonic()
    emit(name, 'running', stream=stream)
    try:
        yield
    except BaseException:
        emit(name, 'failed', (time.monotonic() - started) * 1000, stream)
        raise
    else:
        emit(name, 'completed', (time.monotonic() - started) * 1000, stream)


def read_progress(config, service):
    """Bounded, read-only log metadata. A recorded event is not proof of a live process."""
    path = Path(config['state']) / 'logs' / (service + '.log')
    try:
        with path.open('rb') as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size - 65536))
            lines = stream.read().decode('utf8', errors='replace').splitlines()
        result = {'logBytes': size, 'logUpdatedAt': datetime.fromtimestamp(
            path.stat().st_mtime, timezone.utc).isoformat()}
    except FileNotFoundError:
        return None
    for line in reversed(lines):
        if not line.startswith(PREFIX):
            continue
        try:
            event = json.loads(line[len(PREFIX):])
            if (not isinstance(event, dict) or event.get('phase') not in PHASES
                    or event.get('status') not in ('running', 'completed', 'failed', 'reused')
                    or not isinstance(event.get('elapsedMs'), (int, float))
                    or isinstance(event.get('elapsedMs'), bool)
                    or not math.isfinite(event['elapsedMs']) or event['elapsedMs'] < 0
                    or not isinstance(event.get('at'), str)):
                continue
            datetime.fromisoformat(event['at'].replace('Z', '+00:00'))
            result['lastPhase'] = {key: event[key] for key in ('phase', 'status', 'at', 'elapsedMs')}
            break
        except (ValueError, TypeError):
            continue
    return result
