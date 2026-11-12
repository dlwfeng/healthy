"""Run a task in its own process group; allow the host coordinator to cancel it."""
import argparse
import os
from pathlib import Path
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--pid-file', type=Path, required=True)
parser.add_argument('--stop', action='store_true')
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
if args.stop:
    try:
        group=int(args.pid_file.read_text())
        os.killpg(group, signal.SIGTERM)
        for _ in range(50):
            time.sleep(0.1)
            os.killpg(group, 0)
        os.killpg(group, signal.SIGKILL)
    except (FileNotFoundError, ProcessLookupError):
        pass
else:
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    proc = subprocess.Popen(command, start_new_session=True)
    try:
        args.pid_file.write_text(str(proc.pid))
        raise SystemExit(proc.wait())
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
        args.pid_file.unlink(missing_ok=True)
