"""Verify bundled toolbar icons independently of the runtime worker or Pillow."""
from __future__ import annotations

import hashlib
import json
import struct
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "browser/application-assist"
SOURCE = ROOT / "artifacts/escape-hatch/public/escapehatch-mascot.webp"
SOURCE_SHA256 = "e1e0f6e7ff0470231ae3ffa042e6a36555659a86ea070bee036e2badcec76451"
SIZES = (16, 32, 48, 128)


class ExtensionToolbarIconTests(unittest.TestCase):
    def test_manifest_has_bundled_extension_and_action_icons(self):
        manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
        expected = {str(size): f"icons/mascot-{size}.png" for size in SIZES}
        self.assertEqual(manifest["icons"], expected)
        self.assertEqual(manifest["action"]["default_icon"], expected)

    def test_pngs_have_exact_dimensions_valid_pixels_and_approved_source_provenance(self):
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), SOURCE_SHA256)
        for size in SIZES:
            with self.subTest(size=size):
                payload = (EXTENSION / "icons" / f"mascot-{size}.png").read_bytes()
                self.assertEqual(payload[:8], b"\x89PNG\r\n\x1a\n")
                offset, compressed, metadata, kinds = 8, b"", {}, []
                while offset < len(payload):
                    length = struct.unpack(">I", payload[offset:offset + 4])[0]
                    kind = payload[offset + 4:offset + 8]
                    data = payload[offset + 8:offset + 8 + length]
                    crc = struct.unpack(">I", payload[offset + 8 + length:offset + 12 + length])[0]
                    self.assertEqual(zlib.crc32(kind + data), crc)
                    kinds.append(kind)
                    if kind == b"IHDR":
                        self.assertEqual(struct.unpack(">IIBBBBB", data), (size, size, 8, 6, 0, 0, 0))
                    elif kind == b"tEXt":
                        key, value = data.split(b"\0", 1); metadata[key] = value
                    elif kind == b"IDAT":
                        compressed += data
                    offset += length + 12
                self.assertEqual(offset, len(payload))
                self.assertEqual(kinds, [b"IHDR", b"tEXt", b"tEXt", b"IDAT", b"IEND"])
                self.assertEqual(metadata[b"EscapeHatchSourceSHA256"].decode(), SOURCE_SHA256)
                self.assertEqual(metadata[b"EscapeHatchGenerator"].decode(), "Pillow 12.3.0; RGBA LANCZOS; PNG filter=0 stored-deflate v1")
                rows = zlib.decompress(compressed)
                stride = size * 4 + 1
                self.assertEqual(len(rows), stride * size)
                self.assertTrue(all(rows[row * stride] == 0 for row in range(size)))
                alpha = [rows[row * stride + 1 + pixel * 4 + 3] for row in range(size) for pixel in range(size)]
                self.assertGreater(max(alpha), 0, "Icon must not be transparent/empty")
                self.assertEqual(min(alpha), 0, "Approved mascot transparency must survive")


if __name__ == "__main__":
    unittest.main()
