"""Exercise job configuration before the upstream backend accepts requests, without model downloads."""
import argparse
import asyncio
from contextlib import asynccontextmanager
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('hybrid_backend', Path(__file__).parents[1] / 'runtime/hybrid-backend.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class ConfidenceTests(unittest.TestCase):
    def test_invalid_cli_values(self):
        for value in ['nan', 'inf', '-0.01', '1.01', 'true', '']:
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                backend.parse_confidence_threshold(value)
        for value in ['0', '0.1', '1']:
            self.assertEqual(backend.parse_confidence_threshold(value), float(value))

    def test_applies_threshold_after_converter_initialization_and_before_serving(self):
        upstream = ModuleType('opendataloader_pdf.hybrid_server')
        events = []

        def create_app(**kwargs):
            self.assertTrue(kwargs['force_ocr'])
            self.assertEqual(kwargs['ocr_lang'], ['ch_sim', 'en'])

            @asynccontextmanager
            async def lifespan(app):
                options = SimpleNamespace(ocr_options=SimpleNamespace(confidence_threshold=0.5))
                upstream.converter = SimpleNamespace(format_to_options={'pdf': SimpleNamespace(pipeline_options=options)})
                events.append('started')
                try:
                    yield
                finally:
                    events.append('stopped')
            return SimpleNamespace(router=SimpleNamespace(lifespan_context=lifespan))

        upstream.create_app = create_app
        modules = {
            'opendataloader_pdf': ModuleType('opendataloader_pdf'),
            'opendataloader_pdf.hybrid_server': upstream,
            'docling': ModuleType('docling'),
            'docling.datamodel': ModuleType('docling.datamodel'),
            'docling.datamodel.base_models': ModuleType('docling.datamodel.base_models')
        }
        modules['docling.datamodel.base_models'].InputFormat = SimpleNamespace(PDF='pdf')

        async def exercise():
            for threshold in [0, 0.1, 0.5, 1]:
                app = backend.create_ocr_app(threshold)
                async with app.router.lifespan_context(app):
                    self.assertEqual(events[-1], 'started')
                    actual = upstream.converter.format_to_options['pdf'].pipeline_options.ocr_options.confidence_threshold
                    self.assertEqual(actual, threshold)
                self.assertEqual(events[-1], 'stopped')

        with patch.dict(sys.modules, modules):
            asyncio.run(exercise())


if __name__ == '__main__':
    unittest.main()
