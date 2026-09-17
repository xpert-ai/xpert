"""Job-local official OCR backend; pinned local artifacts only, no persistent server."""
import argparse
import asyncio
import json
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
import resource
import socket
import sys
import threading


def configure_cpu():
    import torch
    # Use the same portable CPU quantization backend on ARM and x86. The default
    # oneDNN quantized LSTM can emit unsupported instructions under x86 emulation.
    if 'qnnpack' not in torch.backends.quantized.supported_engines:
        raise RuntimeError('The managed OCR Runtime requires the QNNPACK CPU backend')
    torch.backends.quantized.engine = 'qnnpack'


def verify_cpu():
    """Check the kernel used by EasyOCR, before advertising Runtime availability."""
    configure_cpu()
    import torch
    model = torch.nn.Sequential(torch.nn.LSTM(64, 64, batch_first=True))
    quantized = torch.ao.quantization.quantize_dynamic(model, {torch.nn.LSTM}, dtype=torch.qint8)
    assert quantized(torch.zeros(1, 2, 64))[0].shape == (1, 2, 64)


def parse_confidence_threshold(value):
    try:
        threshold = float(value)
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError('OCR confidence must be a number between 0 and 1') from None
    if not math.isfinite(threshold) or not 0 <= threshold <= 1:
        raise argparse.ArgumentTypeError('OCR confidence must be a number between 0 and 1')
    return threshold


def create_ocr_app(confidence_threshold):
    from opendataloader_pdf import hybrid_server
    from docling.datamodel.base_models import InputFormat

    app = hybrid_server.create_app(force_ocr=True, ocr_lang=['ch_sim', 'en'], device='cpu', max_file_size=100 * 1024 * 1024)
    upstream_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(app):
        async with upstream_lifespan(app):
            # The pinned upstream factory omits this option. Set it after initialization,
            # before requests can construct the cached PDF pipeline. Each Job owns its process.
            options = hybrid_server.converter.format_to_options[InputFormat.PDF].pipeline_options
            options.ocr_options.confidence_threshold = confidence_threshold
            yield

    app.router.lifespan_context = lifespan
    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--ready', type=Path, required=True)
    parser.add_argument('--ocr-confidence-threshold', type=parse_confidence_threshold, default=0.5)
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    # These are platform artifacts; no model, executable or service path comes from the PDF.
    os.environ['DOCLING_ARTIFACTS_PATH'] = str(args.root / 'models')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'

    # A pipe owned by the Action is a lifetime lease, including abrupt parent termination.
    def watch_parent():
        sys.stdin.buffer.read()
        os._exit(0)

    threading.Thread(target=watch_parent, daemon=True).start()
    configure_cpu()
    import uvicorn

    app = create_ocr_app(args.ocr_confidence_threshold)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level='warning', loop='asyncio', access_log=False))

    async def serve():
        serving = asyncio.create_task(server.serve(sockets=[sock]))
        while not server.started:
            if serving.done():
                await serving
                raise RuntimeError('OCR backend did not start')
            await asyncio.sleep(0.05)
        temporary = args.ready.with_suffix('.tmp')
        temporary.write_text(json.dumps({'port': sock.getsockname()[1]}))
        temporary.replace(args.ready)
        await serving

    try:
        asyncio.run(serve())
    finally:
        sock.close()


if __name__ == '__main__':
    main()
