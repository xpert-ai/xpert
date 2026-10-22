"""Compose independent interactive and Compute APIs over the same authenticated control plane."""
import json
import signal
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

import runner
from compute_service import ComputeService
from compute_storage import download, upload


class RunnerHandler(runner.RunnerHandler):
    def __init__(self, *args, compute, **kwargs):
        self.compute = compute
        super().__init__(*args, **kwargs)

    def _dispatch(self, method):
        path = urlsplit(self.path).path
        if not path.startswith("/v1/compute"):
            return super()._dispatch(method)
        streaming = False
        try:
            self._authorize()
            parts = path.strip("/").split("/")
            if parts == ["v1", "compute", "health"] and method == "GET":
                self._write_json(self.compute.health())
                return
            payload = self._read_json() if method == "POST" else None
            if parts == ["v1", "compute", "jobs"] and method == "POST":
                job = self.compute.create(payload)
                self._write_json({"runtimeId": job.identity}, 201)
                return
            if len(parts) < 4 or parts[:3] != ["v1", "compute", "jobs"]:
                raise runner.RunnerError("Route not found", 404)
            identity = parts[3]
            route = parts[4:]
            if not route and method == "DELETE":
                self.compute.destroy(identity)
                self._write_json({"status": "ok"})
                return
            job = self.compute.get(identity)
            if route == ["terminate"] and method == "POST":
                job.cancel()
                self._write_json({"status": "ok"})
                return
            if not isinstance(payload, dict) or method != "POST":
                raise runner.RunnerError("Invalid Compute request")
            if route == ["files", "upload"] and set(payload) == {"files"}:
                self._write_json(upload(job, payload["files"]))
                return
            if route == ["files", "download"] and set(payload) == {"paths"}:
                self._write_json(download(job, payload["paths"]))
                return
            if route != ["execute"] or set(payload) != {"timeoutMs", "maxOutputBytes"}:
                raise runner.RunnerError("Invalid Compute request")
            timeout_ms = runner.validate_positive_int(payload["timeoutMs"], "timeoutMs", 1, job.definition["hardDeadlineMs"])
            maximum = runner.validate_positive_int(payload["maxOutputBytes"], "maxOutputBytes", 1, 4 * 1024 * 1024)
            job.ensure_active()
            self.send_response(200)
            self.send_header("content-type", "application/x-ndjson")
            self.send_header("cache-control", "no-store")
            self.end_headers()
            streaming = True
            # A disconnected or non-consuming client must not extend the execution deadline.
            self.connection.settimeout(1)

            def emit(value):
                self.wfile.write((json.dumps(value) + "\n").encode())
                self.wfile.flush()

            result = job.execute(timeout_ms, maximum, lambda text: emit({"type": "output", "text": text}), self._client_disconnected)
            emit({"type": "result", "result": result})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return
        except Exception as error:
            if streaming:
                return
            if isinstance(error, runner.RunnerError):
                self._write_json({"error": str(error)}, error.status)
            else:
                print(f"[nsjail-compute] request failed: {error!r}", flush=True)
                self._write_json({"error": "Compute Runner internal error"}, 500)


def main():
    runner.ensure_startup_invariants()
    runner.NETWORK.initialize()
    compute = ComputeService()
    try:
        server = ThreadingHTTPServer((runner.RUNNER_HOST, runner.RUNNER_PORT), partial(RunnerHandler, compute=compute))
    except BaseException:
        runner.NETWORK.close()
        raise
    stop = threading.Event()

    def reap():
        while not stop.wait(5):
            runner.reap_idle_runtimes()
            compute.reap()

    reaper = threading.Thread(target=reap, daemon=True)
    reaper.start()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: threading.Thread(target=server.shutdown, daemon=True).start())
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stop.set()
        reaper.join(timeout=2)
        try:
            compute.close()
        finally:
            for runtime in list(runner.RUNTIMES.values()):
                runtime.destroy()
            runner.cleanup_recorded_nsjail_cgroups()
            runner.NETWORK.close()
            server.server_close()


if __name__ == "__main__":
    main()
