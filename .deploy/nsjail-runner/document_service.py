"""Document profiles reuse the Jobs isolation engine with immutable, separate root filesystems.
Only Java gets loopback for its job-local OCR service; neither profile has external networking.
"""
from pathlib import Path

from compute_process import ComputeJob
from compute_service import ComputeService


class DocumentNodeJob(ComputeJob):
    rootfs = Path("/opt/xpert-document-node-rootfs")
    state_root = Path("/run/xpert-document-node")
    namespace = "document-node"
    pids = 256
    open_files = 1024
    environment = {
        "XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT": "/opt/xpert/document-dependencies",
        "XPERT_SANDBOX_RUNTIME_MANIFEST_PATH": "/opt/xpert/sandbox-runtime/manifest.json",
        "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2",
        "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
    }


class DocumentJavaJob(DocumentNodeJob):
    rootfs = Path("/opt/xpert-document-java-rootfs")
    state_root = Path("/run/xpert-document-java")
    namespace = "document-java"
    loopback = True
    cpu_topology = True


class DocumentNodeService(ComputeService):
    rootfs = DocumentNodeJob.rootfs
    state_root = DocumentNodeJob.state_root
    job_class = DocumentNodeJob
    probe_timeout_ms = 60000
    health_ttl = 60
    max_jobs = 1


class DocumentJavaService(DocumentNodeService):
    rootfs = DocumentJavaJob.rootfs
    state_root = DocumentJavaJob.state_root
    job_class = DocumentJavaJob


DOCUMENT_SERVICES = {"node": DocumentNodeService, "java": DocumentJavaService}
