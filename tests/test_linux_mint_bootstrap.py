#!/usr/bin/env python3
"""Local Linux runtime integration test, using a fake identity-compatible Vite endpoint.

No GitHub traffic, external network, browser profile, or real npm dependencies.
"""
from pathlib import Path
import json
import os
import socket
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "scripts/linux/escapehatch_runtime.py"
BOOTSTRAP = ROOT / "Get-EscapeHatch.sh"
FAKE_SERVER = r'''
import json, os, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path != '/__escapehatch/runtime':
            self.send_response(404); self.end_headers(); return
        data={'app':'EscapeHatch','protocol':1,'instanceId':os.environ['ESCAPEHATCH_INSTANCE_ID'],
              'repoFingerprint':os.environ['ESCAPEHATCH_REPO_FINGERPRINT'],
              'pid':os.getpid(),'startedAtUtc':os.environ['ESCAPEHATCH_STARTED_AT_UTC']}
        value=json.dumps(data).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(value)
    def do_POST(self):
        if self.path!='/__escapehatch/shutdown' or self.headers.get('x-escapehatch-shutdown-token')!=os.environ['ESCAPEHATCH_SHUTDOWN_TOKEN'] or self.headers.get('x-escapehatch-instance-id')!=os.environ['ESCAPEHATCH_INSTANCE_ID'] or self.headers.get('x-escapehatch-runtime-protocol')!='1':
            self.send_response(401); self.end_headers(); return
        self.send_response(202); self.end_headers(); self.wfile.flush()
        threading.Thread(target=self.server.shutdown,daemon=True).start()
HTTPServer(('127.0.0.1',int(os.environ['PORT'])),Handler).serve_forever()
'''

class LinuxMintBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        folder=Path(self.tmp.name)
        (folder/'bin').mkdir()
        sandbox=folder/'checkout'
        (sandbox/'scripts/linux').mkdir(parents=True)
        (sandbox/'artifacts/escape-hatch/node_modules').mkdir(parents=True)
        self.runtime=sandbox/'scripts/linux/escapehatch_runtime.py'
        shutil.copyfile(RUNTIME,self.runtime)
        server=folder/'fake_server.py';server.write_text(FAKE_SERVER)
        npm=folder/'bin/npm'
        npm.write_text('#!/usr/bin/env bash\npython3 "$FAKE_SERVER" &\nwait $!\n')
        npm.chmod(0o755)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0))
            port=sock.getsockname()[1]
        self.env=os.environ.copy()
        self.env.update({'XDG_STATE_HOME':str(folder/'state'), 'PATH':str(folder/'bin')+os.pathsep+self.env['PATH'],
                         'FAKE_SERVER':str(server), 'ESCAPEHATCH_PORT':str(port),
                         'ESCAPEHATCH_NO_OPEN':'1','HOST':'0.0.0.0'})

    def command(self,action):
        return subprocess.run([sys.executable,str(self.runtime),action],env=self.env,capture_output=True,text=True,timeout=25)

    def test_managed_start_status_stop_and_loopback(self):
        start=self.command('start');self.assertEqual(0,start.returncode, start.stderr)
        state=json.loads((Path(self.env['XDG_STATE_HOME'])/'escapehatch/runtime.json').read_text())
        self.assertNotEqual(state['pid'],state['runner_pid'], 'must track Vite PID, not npm wrapper PID')
        self.assertTrue(state['shutdown_token'])
        self.assertEqual(0, self.command('status').returncode)
        self.assertEqual(0, self.command('start').returncode, 'repeat start should reuse verified runtime')
        stop=self.command('stop');self.assertEqual(0, stop.returncode, stop.stderr)
        self.assertEqual(1, self.command('status').returncode)

    def test_mismatched_identity_never_kills_process(self):
        self.assertEqual(0, self.command('start').returncode)
        state_path=Path(self.env['XDG_STATE_HOME'])/'escapehatch/runtime.json'
        state=json.loads(state_path.read_text())
        try:
            state['instance_id']='forged-instance-id'
            state_path.write_text(json.dumps(state))
            self.assertEqual(2,self.command('stop').returncode)
            self.assertEqual(2,self.command('start').returncode)
        finally:
            state['instance_id']=os.environ.get('ESCAPEHATCH_INSTANCE_ID') or ''
            # For teardown use original correct identity recovered from the real service based on the port.
            import http.client
            c=http.client.HTTPConnection('127.0.0.1',int(self.env['ESCAPEHATCH_PORT']),timeout=2)
            c.request('GET','/__escapehatch/runtime');identity=json.loads(c.getresponse().read());c.close()
            state['instance_id']=identity['instanceId'];state_path.write_text(json.dumps(state))
            self.command('stop')

    def test_bootstrap_check_is_nonmutating(self):
        source=Path(self.tmp.name)/'fresh_source'
        env=self.env|{'ESCAPEHATCH_HOME':str(source)}
        result=subprocess.run(['bash',str(BOOTSTRAP),'--check'],env=env,capture_output=True,text=True,timeout=15)
        self.assertEqual(0,result.returncode,result.stderr)
        self.assertIn('No installed source yet',result.stdout)
        self.assertFalse(source.exists())

    def test_mint_menu_shortcut_user_scoped_and_nonclobbering(self):
        shortcut_source=ROOT/"scripts/linux/install_shortcut.py"
        sandbox=Path(self.tmp.name)/"checkout"
        shutil.copyfile(shortcut_source,sandbox/"scripts/linux/install_shortcut.py")
        home=Path(self.tmp.name)/"home"
        home.mkdir()
        env=self.env|{"HOME":str(home),"XDG_DATA_HOME":str(home/".local/share")}
        script=sandbox/"scripts/linux/install_shortcut.py"
        result=subprocess.run([sys.executable,str(script)],env=env,capture_output=True,text=True)
        self.assertEqual(0,result.returncode,result.stderr)
        launcher=home/".local/bin/escapehatch"
        desktop=home/".local/share/applications/escapehatch.desktop"
        self.assertIn("Managed by EscapeHatch",launcher.read_text())
        self.assertIn("Exec=",desktop.read_text())
        self.assertEqual(0o700, launcher.stat().st_mode & 0o777)
        self.assertEqual(0,subprocess.run([sys.executable,str(script)],env=env).returncode)
        launcher.write_text("# owned by another app\n")
        refused=subprocess.run([sys.executable,str(script)],env=env,capture_output=True,text=True)
        self.assertEqual(2,refused.returncode)
        self.assertEqual("# owned by another app\n",launcher.read_text())

    def test_shell_syntax_and_no_exposed_host(self):
        s=subprocess.run(['bash','-n',str(BOOTSTRAP)],capture_output=True,text=True)
        self.assertEqual(0,s.returncode,s.stderr)
        script=RUNTIME.read_text()
        self.assertIn('"HOST": "127.0.0.1"',script)
        self.assertNotIn('"HOST": "0.0.0.0"',script)
        self.assertIn('merge --ff-only',BOOTSTRAP.read_text())

if __name__=='__main__': unittest.main()
