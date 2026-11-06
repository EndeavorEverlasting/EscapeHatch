#!/usr/bin/env python3
"""Offline fault-injection tests for host-side validation proof, no GitHub access."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/host_validation.py'
spec = importlib.util.spec_from_file_location('host_validation', SCRIPT)
gate = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(gate)


class HostValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='eh-local-gate-')
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        def g(*args):
            subprocess.run(['git', '-C', str(self.repo), *args], check=True, capture_output=True)
        self.g = g
        g('init', '-q')
        g('config', 'user.name', 'Test Agent')
        g('config', 'user.email', 'test@example.test')
        (self.repo/'contracts').mkdir()
        self.manifest = self.repo/'contracts/host-validation.v1.json'
        self.manifest.write_text(json.dumps({
            'schema': gate.MANIFEST_SCHEMA,
            'profiles': {'core': ['passing']},
            'steps': {'passing': {'argv': ['{python}', 'probe.py'], 'timeout_seconds': 5}},
        }), encoding='utf-8')
        (self.repo/'probe.py').write_text("print('synthetic pass')\n", encoding='utf-8')
        g('add', '.')
        g('commit', '-qm', 'fixture')
        self.receipts = self.base/'private-proof'

    def _reload(self):
        return json.loads(self.manifest.read_text(encoding='utf-8'))

    def _save(self, data):
        self.manifest.write_text(json.dumps(data), encoding='utf-8')
        self.g('add', '.')
        self.g('commit', '-qm', 'fixture updated')

    def test_core_pass_receipt_is_private_and_verifies_exact_head(self):
        code, path = gate.run(self.repo, self.manifest, 'core', self.receipts)
        self.assertEqual(code, 0)
        self.assertTrue(path.is_file())
        receipt = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(receipt['steps'][0]['status'], 'PASS')
        self.assertFalse(receipt['provider_checks_verified'])
        self.assertFalse(receipt['installed_runtime_observed'])
        self.assertNotIn('synthetic pass', str(receipt))
        self.assertEqual(gate.verify_receipt(receipt, self.repo, self.manifest, 'core'), (True, 'local_exact_head_pass'))
        self.assertFalse((self.repo/'private-proof').exists())

    def test_stale_commit_invalidation(self):
        _, path = gate.run(self.repo, self.manifest, 'core', self.receipts)
        old = json.loads(path.read_text(encoding='utf-8'))
        (self.repo/'probe.py').write_text("print('new commit')\n", encoding='utf-8')
        self.g('add', 'probe.py')
        self.g('commit', '-qm', 'move HEAD')
        self.assertEqual(gate.verify_receipt(old, self.repo, self.manifest, 'core')[1], 'source_moved')

    def test_dirty_checkout_fails_closed_and_preserves_user_work(self):
        (self.repo/'unrelated-user-work.txt').write_text('do not touch', encoding='utf-8')
        with self.assertRaisesRegex(gate.GateError, 'dirty_checkout'):
            gate.run(self.repo, self.manifest, 'core', self.receipts)
        self.assertEqual((self.repo/'unrelated-user-work.txt').read_text(encoding='utf-8'), 'do not touch')

    def test_failure_receipt_redacts_output_and_does_not_advance(self):
        (self.repo/'probe.py').write_text("import sys\nprint('PRIVATE_SECRET_VALUE')\nsys.exit(5)\n", encoding='utf-8')
        (self.repo/'never.py').write_text("from pathlib import Path\nPath('advanced').write_text('bad')\n", encoding='utf-8')
        data = self._reload()
        data['profiles']['core'].append('never')
        data['steps']['never'] = {'argv': ['{python}', 'never.py'], 'timeout_seconds': 5}
        self._save(data)
        code, path = gate.run(self.repo, self.manifest, 'core', self.receipts)
        self.assertEqual(code, 20)
        txt = path.read_text(encoding='utf-8')
        self.assertNotIn('PRIVATE_SECRET_VALUE', txt)
        self.assertFalse((self.repo/'advanced').exists())
        data = json.loads(txt)
        self.assertEqual(len(data['steps']), 1)
        self.assertEqual(data['steps'][0]['exit_code'], 5)
        self.assertEqual(gate.verify_receipt(data,self.repo,self.manifest,'core')[1], 'incomplete_steps')

    def test_manifest_mutation_and_checksum_tampering_detected(self):
        _, path = gate.run(self.repo, self.manifest, 'core', self.receipts)
        r = json.loads(path.read_text(encoding='utf-8'))
        fake = dict(r)
        fake['provider_checks_verified'] = True
        self.assertEqual(gate.verify_receipt(fake,self.repo,self.manifest,'core')[1], 'receipt_digest_mismatch')
        new = self._reload()
        new['purpose'] = 'changed'
        self._save(new)
        self.assertEqual(gate.verify_receipt(r,self.repo,self.manifest,'core')[1], 'manifest_changed')

    def test_receipts_must_be_outside_repository(self):
        with self.assertRaisesRegex(gate.GateError,'receipt_inside_checkout_forbidden'):
            gate.run(self.repo, self.manifest,'core',self.repo/'secret-proof')

    def test_invalid_manifest_commands_are_rejected(self):
        data = self._reload()
        data['steps']['passing']['argv'] = ['sh', '-c', 'true']
        self.manifest.write_text(json.dumps(data),encoding='utf-8')
        with self.assertRaisesRegex(gate.GateError,'invalid_step_argv'):
            gate.load_manifest(self.manifest)

    def test_entire_checkpoint_trailer_is_only_captured_as_id(self):
        self.g('commit', '--allow-empty', '-qm', 'Synthetic session\n\nEntire-Checkpoint: 01K9TQ8ZP7X3F5M2WVJ4CNRB6D')
        _, path = gate.run(self.repo, self.manifest, 'core', self.receipts)
        receipt = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(receipt['source']['entire_checkpoint_id'], '01K9TQ8ZP7X3F5M2WVJ4CNRB6D')
        self.assertNotIn('Synthetic session', str(receipt))

    def test_noncanonical_manifest_rejected(self):
        alternate = self.base/'host-other.json'
        alternate.write_bytes(self.manifest.read_bytes())
        with self.assertRaisesRegex(gate.GateError, 'noncanonical_manifest_forbidden'):
            gate.run(self.repo, alternate, 'core', self.receipts)

    def test_nonzero_without_provider_is_not_a_remote_ci_pass(self):
        _, path = gate.run(self.repo, self.manifest,'core',self.receipts)
        document = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(document['scope'],'HOST_LOCAL_SOURCE_VALIDATION_ONLY')
        self.assertIsNone(document['source']['origin_main_sha'])
        self.assertNotIn('repository_token', document)


if __name__=='__main__':
    unittest.main()
