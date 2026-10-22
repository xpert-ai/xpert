"""Job files are RPC-owned; the jail sees immutable inputs and bounded scratch only."""
import base64
import binascii
import errno
import os
import pathlib
import re
import stat
import uuid

from runner import RunnerError

MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_FILES = 4096
ID_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def runtime_id(value):
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise RunnerError("Invalid Compute runtime identity")
    return value


def file_parts(value, areas):
    if not isinstance(value, str) or not value.startswith("/workspace/"):
        raise RunnerError("Invalid Compute file path")
    parts = value[len("/workspace/"):].split("/")
    if len(parts) < 2 or parts[0] not in areas or any(
        part in ("", ".", "..") or "\x00" in part or "\\" in part or len(part) > 255 for part in parts
    ):
        raise RunnerError("Invalid Compute file path")
    if len(parts) > 32:
        raise RunnerError("Invalid Compute file path")
    return parts


def parent_fd(root: pathlib.Path, parts, create=False):
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            created = False
            if create:
                try:
                    os.mkdir(part, 0o755, dir_fd=fd)
                    created = True
                except FileExistsError:
                    pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            if created:
                os.fchmod(child, 0o755)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def error_code(error):
    if isinstance(error, FileNotFoundError):
        return "file_not_found"
    if isinstance(error, IsADirectoryError):
        return "is_directory"
    if isinstance(error, PermissionError) or isinstance(error, OSError) and error.errno in (errno.ENOSPC, errno.EROFS):
        return "permission_denied"
    return "invalid_path"


def upload(job, files):
    if not isinstance(files, list) or len(files) > MAX_FILES:
        raise RunnerError("Invalid Compute upload")
    results = []
    # Sealing and uploads are atomic relative to execution; invocation replies remain host-writable.
    with job.lock:
        job.ensure_active()
        for entry in files:
            path = entry.get("path", "") if isinstance(entry, dict) else ""
            try:
                parts = file_parts(path, {"invocations"} if job.sealed else {"input", "runtime", "invocations"})
                if parts[0] == "invocations" and (len(parts) != 2 or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}\.json", parts[1])):
                    raise RunnerError("Invalid invocation reply")
                encoded = entry.get("contentBase64")
                if not isinstance(encoded, str) or len(encoded) > (MAX_FILE_BYTES + 2) // 3 * 4:
                    raise RunnerError("Invalid Compute file contents")
                content = base64.b64decode(encoded, validate=True)
                if len(content) > MAX_FILE_BYTES or job.uploaded_files >= MAX_FILES:
                    raise RunnerError("Compute input limit exceeded")
                fd = parent_fd(job.workspace, parts, create=True)
                temporary = f".upload-{uuid.uuid4().hex}"
                try:
                    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444, dir_fd=fd), "wb") as output:
                        os.fchmod(output.fileno(), 0o444)
                        output.write(content)
                    # Never replace an existing input or invocation reply.
                    os.link(temporary, parts[-1], src_dir_fd=fd, dst_dir_fd=fd, follow_symlinks=False)
                    job.uploaded_files += 1
                finally:
                    try:
                        os.unlink(temporary, dir_fd=fd)
                    except FileNotFoundError:
                        pass
                    os.close(fd)
                results.append({"path": path, "error": None})
            except (RunnerError, OSError, ValueError, binascii.Error) as error:
                results.append({"path": path if isinstance(path, str) else "", "error": error_code(error)})
    return results


def download(job, paths):
    if not isinstance(paths, list) or len(paths) > 64:
        raise RunnerError("Invalid Compute download")
    results = []
    total = 0
    with job.lock:
        job.ensure_active()
        if not job.finished.is_set():
            raise RunnerError("Compute outputs are available only after execution", 409)
        for path in paths:
            try:
                parts = file_parts(path, {"output"})
                fd = parent_fd(job.scratch, parts)
                try:
                    input_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                finally:
                    os.close(fd)
                with os.fdopen(input_fd, "rb") as source:
                    info = os.fstat(source.fileno())
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > MAX_FILE_BYTES - total:
                        raise RunnerError("Invalid Compute output")
                    content = source.read(MAX_FILE_BYTES - total + 1)
                total += len(content)
                if total > MAX_FILE_BYTES:
                    raise RunnerError("Compute download limit exceeded")
                results.append({"path": path, "contentBase64": base64.b64encode(content).decode(), "error": None})
            except (RunnerError, OSError, ValueError) as error:
                results.append({"path": path if isinstance(path, str) else "", "contentBase64": None, "error": error_code(error)})
    return results
