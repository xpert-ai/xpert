#!/usr/bin/env python3
"""Real document Jobs acceptance in a disposable Linux Runner, including native and OCR dependencies."""
import base64
import hashlib
import json
import os
import pathlib
import unittest
import urllib.error
import urllib.request
import uuid

URL = os.environ.get("XPERT_NSJAIL_POC_URL", "http://127.0.0.1:8090").rstrip("/")
TOKEN = os.environ.get("XPERT_NSJAIL_RUNNER_TOKEN", "")
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PROFILES = {"libreoffice": "document/libreoffice-v1", "node": "document/node-20/v1", "java": "document/java-17/v1"}


def request(route, data=None, method=None, token=TOKEN):
    return HTTP.open(urllib.request.Request(URL + route,
        data=json.dumps(data).encode() if data is not None else None, method=method,
        headers={"authorization": "Bearer " + token, "content-type": "application/json"}), timeout=100)


def rpc(route, data=None, method=None):
    with request(route, data, method) as response:
        return json.load(response)


class DocumentIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.definitions = {}
        for family, profile in PROFILES.items():
            health = rpc(f"/v1/document/{family}/health")
            if not health.get("available"):
                raise AssertionError(f"{profile} health failed: {health}")
            if health["definition"]["name"] != profile:
                raise AssertionError("Document profile mismatch")
            cls.definitions[family] = health["definition"]

    def setUp(self):
        self.jobs = []

    def tearDown(self):
        for family, identity in self.jobs:
            rpc(f"/v1/document/{family}/jobs/{identity}", method="DELETE")
            self.assertFalse((pathlib.Path(f"/run/xpert-document-{family}") / identity).exists())
            self.assertEqual(list(pathlib.Path("/sys/fs/cgroup").glob(f"xpert-document-{family}-*-{identity}")), [])

    def create(self, family, script):
        identity = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        prefix = f"/v1/document/{family}/jobs"
        rpc(prefix, {"runtimeId": identity, "definition": self.definitions[family]})
        self.jobs.append((family, identity))
        files = {
            "runtime/action/runner.mjs": script,
            "runtime/action-manifest.json": json.dumps({"name": "document.probe", "version": "1.0.0", "runtimeContractVersion": "1", "entrypoint": "runner.mjs"}),
            "input/job.json": '{"payload":{}}'
        }
        result = rpc(f"{prefix}/{identity}/files/upload", {"files": [
            {"path": "/workspace/" + name, "contentBase64": base64.b64encode(content.encode()).decode()}
            for name, content in files.items()
        ]})
        self.assertTrue(all(item["error"] is None for item in result), result)
        return identity

    def execute(self, family, identity, timeout=90000):
        with request(f"/v1/document/{family}/jobs/{identity}/execute", {"timeoutMs": timeout, "maxOutputBytes": 65536}) as response:
            result = None
            for line in response:
                event = json.loads(line)
                if event["type"] == "result":
                    result = event["result"]
            self.assertIsNotNone(result)
            return result

    def test_native_conversion_and_ocr_in_real_jails(self):
        # The shared verifier executes native CSV/PDF conversion, PDF rendering,
        # Java CLI conversion and the OCR CPU kernel, with locked model integrity checks.
        for family in PROFILES:
            with self.subTest(family=family):
                identity = self.create(family, """
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
execFileSync('node', FAMILY === 'libreoffice' ? ['/opt/xpert/sandbox-runtime/verify-document-preview.mjs'] : ['/opt/xpert/sandbox-runtime/verify-document-runtime.mjs',
 '/opt/xpert/sandbox-runtime/manifest.json', '/opt/xpert/sandbox-runtime/dependencies.lock.json',
 '/opt/xpert/document-dependencies'], {timeout:85000, stdio:'inherit'});
writeFileSync('/workspace/output/result.json', JSON.stringify({verified:true}));
""".replace("FAMILY", json.dumps(family)))
                result = self.execute(family, identity)
                self.assertEqual(result["exitCode"], 0, result)
                downloaded = rpc(f"/v1/document/{family}/jobs/{identity}/files/download", {"paths": ["/workspace/output/result.json"]})[0]
                self.assertIsNone(downloaded["error"], downloaded)
                self.assertEqual(json.loads(base64.b64decode(downloaded["contentBase64"])), {"verified": True})

    def test_profile_isolation_resources_and_job_local_loopback(self):
        for family in PROFILES:
            with self.subTest(family=family):
                script = """
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import net from 'node:net';
assert.equal(process.getuid(),10001);
assert.equal(process.env.XPERT_NSJAIL_RUNNER_TOKEN,undefined);
assert.match(readFileSync('/proc/self/status','utf8'),/NoNewPrivs:\\s+1/);
for (const path of ['/etc/probe','/workspace/input/job.json','/workspace/runtime/action/runner.mjs']) assert.throws(()=>writeFileSync(path,'bad'));
for (const path of ['/app/server.py','/opt/xpert-compute-rootfs/etc/passwd','/run/xpert-document-node/owner.json']) assert.throws(()=>readFileSync(path));
for (const host of ['1.1.1.1','169.254.169.254']) await new Promise((resolve,reject)=>{
 const socket=net.connect({host,port:80}); socket.setTimeout(200);
 socket.once('connect',()=>{socket.destroy();reject(new Error('External network enabled'))});
 socket.once('error',()=>{socket.destroy();resolve()}); socket.once('timeout',()=>{socket.destroy();resolve()});
});
const server=net.createServer(socket=>{socket.on('error',()=>{});socket.end('local')});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',resolve)});
const connected=await new Promise(resolve=>{
 const socket=net.connect({host:'127.0.0.1',port:server.address().port});socket.setTimeout(200);
 socket.once('connect',()=>{socket.destroy();resolve(true)});
 socket.once('error',()=>{socket.destroy();resolve(false)});socket.once('timeout',()=>{socket.destroy();resolve(false)});
});
server.close();assert.equal(connected,LOOPBACK);
if (LOOPBACK) {
 assert.match(readFileSync('/sys/devices/system/cpu/possible','utf8'),/^[0-9]/);
 const mount=readFileSync('/proc/self/mountinfo','utf8').split('\\n').map(line=>line.split(' ')).find(parts=>parts[4]==='/sys/devices/system/cpu');
 assert.ok(mount && mount[5].split(',').includes('ro'));
 assert.throws(()=>readFileSync('/sys/kernel/uevent_seqnum'));
}

""".replace("LOOPBACK", "true" if family == "java" else "false")
                identity = self.create(family, script)
                owner = json.loads((pathlib.Path(f"/run/xpert-document-{family}") / identity / "owner.json").read_text())
                cgroup = pathlib.Path("/sys/fs/cgroup") / owner["cgroup"]
                self.assertEqual((cgroup / "memory.max").read_text().strip(), str(self.definitions[family]["resources"]["memoryMb"] * 1024 * 1024))
                self.assertEqual((cgroup / "memory.swap.max").read_text().strip(), "0")
                self.assertEqual((cgroup / "pids.max").read_text().strip(), "256")
                self.assertEqual((cgroup / "cpu.max").read_text().strip(), "200000 100000")
                result = self.execute(family, identity, 5000)
                self.assertEqual(result["exitCode"], 0, result)
                other = "java" if family == "node" else "node"
                with self.assertRaises(urllib.error.HTTPError) as error:
                    rpc(f"/v1/document/{other}/jobs/{identity}/files/download", {"paths": ["/workspace/output/result.json"]})
                self.assertEqual(error.exception.code, 404)

    def test_auth_and_cross_profile_policy_rejection(self):
        for family in PROFILES:
            with self.subTest(family=family):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request(f"/v1/document/{family}/health", token="invalid")
                self.assertEqual(error.exception.code, 401)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    rpc(f"/v1/document/{family}/jobs", {"runtimeId": "a" * 64, "definition": self.definitions["java" if family == "node" else "node"]})
                self.assertEqual(error.exception.code, 409)
        with self.assertRaises(urllib.error.HTTPError) as error:
            rpc("/v1/document/unknown/health")
        self.assertEqual(error.exception.code, 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
