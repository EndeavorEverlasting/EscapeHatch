"""Exercise the .desktop entry with the same GIO API used by GUI file managers."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

from gi.repository import Gio


ROOT = Path(__file__).resolve().parents[1]
DESKTOP_ENTRY = ROOT / "Hey, press me, click me.desktop"


class ContainerDesktopEntryTest(unittest.TestCase):
    def test_dispatches_from_an_extracted_folder_with_spaces(self):
        subprocess.run(["desktop-file-validate", str(DESKTOP_ENTRY)], check=True)
        with tempfile.TemporaryDirectory(prefix="escapehatch-desktop-") as temp:
            root = Path(temp)
            project = root / "EscapeHatch extracted"
            scripts = project / "scripts" / "container"
            scripts.mkdir(parents=True)
            entry = project / DESKTOP_ENTRY.name
            shutil.copy2(DESKTOP_ENTRY, entry)

            signal = root / "launcher-directory"
            launcher = scripts / "launch.sh"
            launcher.write_text('#!/bin/bash\nprintf "%s\\n" "$PWD" > "$ESCAPEHATCH_DESKTOP_TEST_SIGNAL"\n')
            launcher.chmod(0o755)

            # GIO resolves and expands the actual entry. Stand in only for the
            # terminal window so the file-manager test also runs without a display.
            binary = root / "bin"
            binary.mkdir()
            terminal = binary / "test-terminal"
            terminal.write_text(
                '#!/bin/bash\n'
                'while (($#)); do\n'
                '  if [[ "$1" == /bin/bash ]]; then exec "$@"; fi\n'
                '  shift\n'
                'done\n'
                'exit 1\n'
            )
            terminal.chmod(0o755)
            for name in ("xdg-terminal-exec", "gnome-terminal", "mate-terminal", "xfce4-terminal",
                         "tilix", "konsole", "lxterminal", "x-terminal-emulator", "xterm"):
                (binary / name).symlink_to(terminal)

            application = Gio.DesktopAppInfo.new_from_filename(str(entry))
            self.assertIsNotNone(application, "GIO must accept the actual desktop entry")
            context = Gio.AppLaunchContext()
            context.setenv("PATH", f"{binary}{os.pathsep}{os.environ['PATH']}")
            context.setenv("ESCAPEHATCH_DESKTOP_TEST_SIGNAL", str(signal))
            # The terminal itself is selected in the GIO process.
            previous_path = os.environ["PATH"]
            try:
                os.environ["PATH"] = f"{binary}{os.pathsep}{previous_path}"
                self.assertTrue(application.launch([], context))
            finally:
                os.environ["PATH"] = previous_path

            deadline = time.monotonic() + 5
            while not signal.exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(signal.exists(), "GIO did not reach the container launcher")
            self.assertEqual(signal.read_text().strip(), str(project))


if __name__ == "__main__":
    unittest.main()
