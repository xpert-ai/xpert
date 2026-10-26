#!/usr/bin/env python3
"""Real Compute RPC/isolation regression tests for a disposable Linux Runner container."""
import base64
import hashlib
import json
import os
import pathlib
import time
import unittest
import urllib.error
import urllib.request
import uuid

URL = os.environ.get("XPERT_NSJAIL_POC_URL", "http://127.0.0.1:8090").rstrip("/")
TOKEN = os.environ.get("XPERT_NSJAIL_RUNNER_TOKEN", "")
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PREFIX = "/v1/compute"
CGROUP_ROOT = pathlib.Path(os.environ.get("XPERT_NSJAIL_TEST_CGROUP_ROOT", "/sys/fs/cgroup"))


def request(route, data=None, method=None, token=TOKEN):
    return HTTP.open(urllib.request.Request(URL + route, data=json.dumps(data).encode() if data is not None else None,
        method=method, headers={"authorization": "Bearer " + token, "content-type": "application/json"}), timeout=40)


def rpc(route, data=None, method=None):
    with request(route, data, method) as response:
        return json.load(response)


class ComputeIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        health = rpc(PREFIX + "/health")
        if not health.get("available"):
            raise AssertionError(f"Compute health failed: {health}")
        cls.definition = health["definition"]

    def setUp(self):
        self.jobs = []

    def tearDown(self):
        for identity in self.jobs:
            rpc(PREFIX + "/jobs/" + identity, method="DELETE")
            self.assertFalse((pathlib.Path("/run/xpert-compute") / identity).exists())
            self.assertEqual(list(CGROUP_ROOT.glob("xpert-compute-*-" + identity)), [])

    def create(self, script=None):
        identity = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        rpc(PREFIX + "/jobs", {"runtimeId": identity, "definition": self.definition})
        self.jobs.append(identity)
        if script:
            self.upload(identity, {
                "runtime/action/runner.mjs": script,
                "runtime/action-manifest.json": json.dumps({"name": "compute.probe", "version": "1.0.0", "runtimeContractVersion": "1", "entrypoint": "runner.mjs"}),
                "input/job.json": '{"payload":{"amounts":[100,200,300]}}'
            })
        return identity

    def upload(self, identity, files):
        result = rpc(f"{PREFIX}/jobs/{identity}/files/upload", {"files": [
            {"path": "/workspace/" + name, "contentBase64": base64.b64encode(content.encode()).decode()} for name, content in files.items()
        ]})
        self.assertTrue(all(item["error"] is None for item in result), result)
        return result

    def execute(self, identity, timeout=5000, maximum=65536, on_output=lambda text: None):
        with request(f"{PREFIX}/jobs/{identity}/execute", {"timeoutMs": timeout, "maxOutputBytes": maximum}) as response:
            result = None
            for line in response:
                event = json.loads(line)
                if event["type"] == "output":
                    on_output(event["text"])
                else:
                    self.assertEqual(event["type"], "result")
                    result = event["result"]
            self.assertIsNotNone(result)
            return result

    def read(self, identity, filename):
        result = rpc(f"{PREFIX}/jobs/{identity}/files/download", {"paths": ["/workspace/output/" + filename]})[0]
        self.assertIsNone(result["error"], result)
        return base64.b64decode(result["contentBase64"])

    def test_python_and_javascript_with_streamed_host_invocations(self):
        for language in ("javascript", "python"):
            with self.subTest(language=language):
                body = '''
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
console.log('XPERT_SANDBOX_INVOKE ' + JSON.stringify({id:'call_1',operation:'file.read',payload:{alias:'orders'}}));
while (!existsSync('/workspace/invocations/call_1.json')) await new Promise(resolve => setTimeout(resolve, 5));
const {value} = JSON.parse(readFileSync('/workspace/invocations/call_1.json'));
const result = LANGUAGE === 'python'
 ? JSON.parse(execFileSync('python3',['-I','-c','import json,sys; from decimal import Decimal; print(json.dumps({"total":str(sum(Decimal(x) for x in json.loads(sys.argv[1])))}))',JSON.stringify(value)]))
 : {total: String(value.reduce((sum, item) => sum + Number(item), 0))};
writeFileSync('/workspace/output/result.json', JSON.stringify(result));
'''.replace("LANGUAGE", json.dumps(language))
                identity = self.create(body)
                pending = ""
                calls = []

                def callback(text):
                    nonlocal pending
                    pending += text
                    while "\n" in pending:
                        line, pending = pending.split("\n", 1)
                        if line.startswith("XPERT_SANDBOX_INVOKE "):
                            invocation = json.loads(line.split(" ", 1)[1])
                            calls.append(invocation)
                            self.upload(identity, {"invocations/call_1.json": json.dumps({"value": ["100", "200", "300"]})})

                result = self.execute(identity, on_output=callback)
                self.assertEqual(result["exitCode"], 0, result)
                self.assertEqual(len(calls), 1)
                self.assertEqual(json.loads(self.read(identity, "result.json")), {"total": "600"})

    def test_security_boundaries_and_job_isolation(self):
        other = self.create()
        script = '''
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
assert.equal(process.getuid(),10001);
assert.equal(process.env.XPERT_NSJAIL_RUNNER_TOKEN,undefined);
const status=readFileSync('/proc/self/status','utf8');
assert.match(status,/NoNewPrivs:\\s+1/); assert.match(status,/CapEff:\\s+0+\\n/);
for (const path of ['/etc/probe','/workspace/input/job.json','/workspace/runtime/action/runner.mjs','/workspace/invocations/fake.json']) assert.throws(()=>writeFileSync(path,'bad'));
for (const path of ['/app/runner.py','/sandbox/private','/run/xpert-compute/OTHER/owner.json']) assert.throws(()=>readFileSync(path));
execFileSync('python3',['-I','-c',`import socket,os
assert len(os.sched_getaffinity(0)) == 1
for host in ['127.0.0.1','1.1.1.1','169.254.169.254']:
 s=socket.socket(); s.settimeout(.1); assert s.connect_ex((host,80)) != 0; s.close()
`]);
writeFileSync('/workspace/output/ok','yes');
'''.replace("OTHER", other)
        identity = self.create(script)
        owner = json.loads((pathlib.Path("/run/xpert-compute") / identity / "owner.json").read_text())
        cgroup = CGROUP_ROOT / owner["cgroup"]
        self.assertEqual((cgroup / "memory.max").read_text().strip(), "268435456")
        self.assertEqual((cgroup / "memory.swap.max").read_text().strip(), "0")
        self.assertEqual((cgroup / "pids.max").read_text().strip(), "64")
        self.assertEqual((cgroup / "cpu.max").read_text().strip(), "100000 100000")
        result = self.execute(identity)
        self.assertEqual(result["exitCode"], 0, result)
        self.assertEqual(self.read(identity, "ok"), b"yes")
        self.assertEqual((cgroup / "cgroup.events").read_text().splitlines()[0], "populated 0")

    def test_memory_limit_reports_oom(self):
        identity = self.create("import {execFileSync} from 'node:child_process'; execFileSync('python3',['-I','-c','x=bytearray(600*1024*1024)']);")
        result = self.execute(identity)
        self.assertEqual(result.get("terminationReason"), "oom", result)

    def test_disk_limit_bounds_aggregate_output(self):
        identity = self.create('''
import assert from 'node:assert/strict'; import {writeFileSync} from 'node:fs';
const chunk=Buffer.alloc(1024*1024); let count=0;
try { for (;count<100;count++) writeFileSync('/workspace/output/'+count,chunk); }
catch(error) { assert.equal(error.code,'ENOSPC'); }
assert.ok(count<=64); console.log('bounded output');
''')
        result = self.execute(identity)
        self.assertEqual(result["exitCode"], 0, result)
        self.assertIn("bounded output", result["output"])

    def test_cancellation_kills_the_process_tree(self):
        identity = self.create("console.log('ready'); setInterval(()=>{},1000);")
        sent = False

        def cancel(text):
            nonlocal sent
            if not sent and 'ready' in text:
                sent = True
                rpc(f"{PREFIX}/jobs/{identity}/terminate", {})

        started = time.monotonic()
        result = self.execute(identity, on_output=cancel)
        self.assertEqual(result.get("terminationReason"), "cancelled", result)
        self.assertLess(time.monotonic() - started, 3)

    def test_timeout_and_output_truncation(self):
        identity = self.create("setInterval(()=>{},1000);")
        result = self.execute(identity, timeout=250)
        self.assertEqual(result.get("terminationReason"), "deadline", result)
        self.assertTrue(result["timedOut"])
        identity = self.create("process.stdout.write('x'.repeat(100000));")
        result = self.execute(identity, maximum=1024)
        self.assertTrue(result["truncated"])
        self.assertLessEqual(len(result["output"].encode()), 1024)

    def test_hard_deadline_includes_staging_time(self):
        identity = self.create("setInterval(()=>{},1000);")
        started = time.monotonic()
        time.sleep(1)
        result = self.execute(identity, timeout=30000)
        self.assertEqual(result.get("terminationReason"), "deadline", result)
        self.assertLess(time.monotonic() - started, 31)

    def test_disconnect_kills_a_silent_running_job(self):
        identity = self.create("console.log('ready'); setInterval(()=>{},1000);")
        response = request(f"{PREFIX}/jobs/{identity}/execute", {"timeoutMs": 10000, "maxOutputBytes": 1024})
        try:
            self.assertIn('ready', json.loads(response.readline())["text"])
        finally:
            response.close()
        owner = json.loads((pathlib.Path("/run/xpert-compute") / identity / "owner.json").read_text())
        events = CGROUP_ROOT / owner["cgroup"] / 'cgroup.events'
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and 'populated 1' in events.read_text():
            time.sleep(.02)
        self.assertIn('populated 0', events.read_text())

    def test_downloads_reject_symlinks_and_fifo(self):
        identity = self.create("import {symlinkSync} from 'node:fs'; import {execFileSync} from 'node:child_process'; symlinkSync('/etc/passwd','/workspace/output/link'); execFileSync('mkfifo',['/workspace/output/fifo']);")
        self.assertEqual(self.execute(identity)["exitCode"], 0)
        results = rpc(f"{PREFIX}/jobs/{identity}/files/download", {"paths": ["/workspace/output/link", "/workspace/output/fifo", "/workspace/../etc/passwd"]})
        self.assertTrue(all(item["error"] and item["contentBase64"] is None for item in results))

    def test_control_plane_rejects_auth_command_and_interactive_access(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            request(PREFIX + '/health', token='invalid')
        self.assertEqual(error.exception.code, 401)
        identity = self.create()
        for route, body, status in [
            (f'{PREFIX}/jobs/{identity}/execute', {"command": "id", "timeoutMs": 1000, "maxOutputBytes": 1024}, 400),
            (f'/v1/runtimes/{identity}/exec', {"command": "id", "timeoutMs": 1000, "maxOutputBytes": 1024}, 404),
            (f'{PREFIX}/jobs/{identity}/terminals', {}, 400),
        ]:
            with self.subTest(route=route), self.assertRaises(urllib.error.HTTPError) as error:
                rpc(route, body)
            self.assertEqual(error.exception.code, status)
        rpc(PREFIX + '/jobs/' + identity, method='DELETE')
        rpc(PREFIX + '/jobs/' + identity, method='DELETE')


if __name__ == '__main__':
    unittest.main(verbosity=2)
