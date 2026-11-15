#!/usr/bin/env python3
"""Manage a dedicated Xpert development instance as an unprivileged Linux user."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from configuration import assert_project, default_state, load, prepare
from platform_services import assert_bootstrapped, bootstrap_source, configure_oidc, infrastructure, initialize, run_command, verify_local_terminal
from processes import SERVICES, ServicePending, healthy, launch_supervisor, owns_supervisor, redacted_tail, service_pid, start_service, stop
from runtime import architecture, atomic_json, lock_file
from builds import ensure_build


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', default=os.getcwd(), help='Dedicated source checkout')
    parser.add_argument('--state', help='Private persistent state directory; default derived from checkout')
    parser.add_argument('--project-root', help='Bind and verify a project-exclusive instance; never adopts shared state')
    sub = parser.add_subparsers(dest='action', required=True)
    setup = sub.add_parser('prepare')
    setup.add_argument('--plugin-root')
    setup.add_argument('--supervisor-mode', choices=('managed', 'detached'),
                       help='New environments default to detached; managed requires an explicitly owned foreground supervise process')
    setup.add_argument('--cache', default=str(Path.home() / '.cache/xpert-dev'))
    for name, default in [('db', 15432), ('redis', 16379), ('api', 3000), ('web', 4200)]:
        setup.add_argument('--' + name + '-port', type=int, default=default)
    sub.add_parser('bootstrap')
    build = sub.add_parser('build', help='Build API/Web once; reuse only verified inputs and outputs')
    build.add_argument('--service', choices=('api', 'web'))
    sub.add_parser('supervise', help='Run Supervisor in the foreground under an external process owner')
    for action in ('start', 'restart'):
        start = sub.add_parser(action)
        start.add_argument('--service', choices=SERVICES)
        start.add_argument('--infra-only', action='store_true')
        start.add_argument('--timeout', type=int, default=60,
                           help='Bounded readiness wait in seconds; exit 75 means the owned service is still pending')
    shutdown = sub.add_parser('stop')
    shutdown.add_argument('--service', choices=SERVICES)
    status = sub.add_parser('status')
    status.add_argument('--strict', action='store_true', help='Exit nonzero unless every platform service is healthy')
    logs = sub.add_parser('logs')
    logs.add_argument('--service', choices=(*SERVICES, 'bootstrap', 'supervisor', 'initdb', 'terminal'), default='api')
    logs.add_argument('--lines', type=int, default=60)
    init = sub.add_parser('initialize')
    init.add_argument('--email', default='developer@xpert.local')
    init.add_argument('--name', default='Xpert Development', help='Development organization display name')
    checkpoint = sub.add_parser('checkpoint', help='Recover an exclusive process-mode test instance')
    checkpoint.add_argument('operation', choices=('create', 'restore', 'verify'))
    checkpoint.add_argument('--name', required=True)
    checkpoint.add_argument('--exclusive-project', required=True,
                            help='Label for an already authorized exclusive project; records scope, does not grant access')
    run = sub.add_parser('exec')
    run.add_argument('--authenticated', action='store_true')
    run.add_argument('command', nargs=argparse.REMAINDER)
    return parser.parse_args()


def status(config):
    services = {name: {'pid': service_pid(config, name), 'port': config['ports'][name],
                       'healthy': healthy(config, name)} for name in SERVICES}
    state = Path(config['state'])
    restore_pending = (state / 'restore-pending.json').exists()
    ready = all(service['healthy'] for service in services.values()) and not restore_pending
    supervisor = json.loads((state / 'supervisor-identity.json').read_text()) if owns_supervisor(config) else None
    infra_ready = all(services[name]['healthy'] for name in ('postgres', 'redis'))
    marker = Path(config['runtime']) / '.xpert-runtime-ready.json'
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=config['platform'],
                              capture_output=True, text=True, check=True).stdout.strip()
    result = {'status': 'platform_ready' if ready else ('infrastructure_ready' if infra_ready else 'not_ready'), 'mode': 'process',
        'platform': config['platform'], 'state': str(state), 'projectRoot': config.get('projectRoot'), 'services': services,
        'supervision': {'mode': config.get('supervisorMode', 'detached'), 'owned': supervisor is not None,
            **({key: supervisor[key] for key in ('pid', 'startTime', 'bootId')} if supervisor else {})},
        'sourceRevision': revision, 'runtime': json.loads(marker.read_text()), 'node': config['node'],
        'apiUrl': f'http://localhost:{config["ports"]["api"]}',
        'webUrl': f'http://localhost:{config["ports"]["web"]}',
        'sandboxProvider': 'local-shell-sandbox', 'productionIsolationVerified': False,
        'recovery': {'pending': restore_pending,
            'nextAction': 'Resume the original checkpoint restore command' if restore_pending else None},
        'administratorLastVerification': json.loads((state / 'administrator.json').read_text()) if (state / 'administrator.json').exists() else None,
        'pluginAcceptance': 'requires_separate_runtime_test'}
    atomic_json(state / 'status.json', result)
    return result


def main():
    os.umask(0o077)
    args = arguments()
    architecture()
    platform = Path(args.platform).expanduser().resolve()
    state = Path(args.state).expanduser().resolve() if args.state else default_state(platform)
    if args.action == 'supervise':
        with lock_file(state / 'operation.lock'):
            config = load(state)
            assert_project(config, args.project_root)
            if config['platform'] != str(platform):
                raise RuntimeError('State belongs to a different checkout')
            if owns_supervisor(config):
                raise RuntimeError('Supervisor is already running; inspect or stop it before supervising')
            config['supervisorMode'] = 'managed'
            atomic_json(state / 'environment.json', config)
            process = launch_supervisor(config, foreground=True)
        # Do not hold the mutation lock for the lifetime of a managed service.
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: process.terminate() if process.poll() is None else None)
        print('XPERT_SUPERVISOR_READY', flush=True)
        return process.wait()
    # Inspection and arbitrary child commands must remain usable while a build or
    # readiness wait holds the mutation lock. exec may itself invoke this CLI.
    if args.action in ('status', 'logs', 'exec'):
        config = load(state)
        assert_project(config, args.project_root)
        if config['platform'] != str(platform):
            raise RuntimeError('State belongs to a different checkout')
        if args.action == 'logs':
            print(redacted_tail(config, args.service, max(1, min(args.lines, 200))))
            return 0
        if args.action == 'exec':
            return run_command(config, args.command, args.authenticated)
        result = status(config)
        print(json.dumps(result, indent=2))
        return int(args.strict and result['status'] != 'platform_ready')
    with lock_file(state / 'operation.lock'):
        if args.action == 'prepare':
            state, config = prepare(args)
            print(json.dumps({'status': 'configured', 'state': str(state), 'runtime': config['runtime']}))
            return 0
        config = load(state)
        assert_project(config, args.project_root)
        if config['platform'] != str(platform):
            raise RuntimeError('State belongs to a different checkout')
        if args.action == 'checkpoint':
            from checkpoints import create, restore, verify
            operation = {'create': create, 'restore': restore, 'verify': verify}[args.operation]
            result = operation(config, args.name, args.exclusive_project)
            print(json.dumps(result, indent=2))
            return int(result['status'] in ('not_ready', 'identity_mismatch'))
        if (state / 'restore-pending.json').exists() and args.action != 'stop':
            raise RuntimeError('Restore is incomplete; resume checkpoint restore before changing this environment')
        if args.action == 'bootstrap':
            bootstrap_source(config)
        elif args.action == 'build':
            assert_bootstrapped(config)
            for name in ([args.service] if args.service else ['web', 'api']):
                ensure_build(config, name)
        elif args.action in ('start', 'restart'):
            if args.timeout <= 0:
                raise ValueError('--timeout must be positive')
            if args.action == 'restart':
                # Keep the supervisor owned by the managed-service lifecycle alive.
                for name in ([args.service] if args.service else reversed(SERVICES)):
                    stop(config, name)
            deadline = time.monotonic() + args.timeout
            try:
                infrastructure(config, min(args.timeout, 120))
                if not args.infra_only:
                    names = [args.service] if args.service else ['web', 'api']
                    if any(name in ('api', 'web') for name in names):
                        assert_bootstrapped(config)
                        configure_oidc(config)
                    for name in names:
                        start_service(config, name, max(0, deadline - time.monotonic()))
                        if name == 'api':
                            verify_local_terminal(config)
            except ServicePending as pending:
                # A timeout is not service failure and must not trigger a restart.
                print(json.dumps({'status': 'pending', 'service': pending.service, 'pid': pending.pid,
                    'resumable': True, 'state': str(state), 'platform': str(platform),
                    'nextAction': 'start', 'serviceStillRunning': pending.pid > 0,
                    'message': 'Repeat start with the same options to wait for the owned service and continue remaining stages; do not repeat restart.'}))
                return 75
        elif args.action == 'stop':
            stop(config, args.service)
        elif args.action == 'initialize':
            print(json.dumps(initialize(config, args.email, args.name), indent=2))
            return 0
        print(json.dumps(status(config), indent=2))
        return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        # subprocess output and HTTP response bodies may contain secrets.
        message = str(error) if isinstance(error, (RuntimeError, ValueError)) else type(error).__name__
        print(json.dumps({'status': 'failed', 'error': message}), file=sys.stderr)
        sys.exit(1)
