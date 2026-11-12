#!/usr/bin/env python3
"""Install the host coordinator; all Pi execution runs in Docker Compose."""
import json
import os
from pathlib import Path
import plistlib
import secrets
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit
from mobile_build_env import coordinator_flutter_environment

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/feedback'
LABEL = 'local.health.feedback-coordinator'
DATA.mkdir(parents=True, exist_ok=True)
config = DATA / 'config.json'
if not config.exists():
    config.write_text(json.dumps({'workerToken': secrets.token_hex(32)}))
config.chmod(0o600)
for name in ('worktrees', 'runs', 'pi-runtime'):
    (DATA/name).mkdir(exist_ok=True)
# Persist the container-accessible form of the existing host proxy for restarts.
env_file=ROOT/'.env'
env_text=env_file.read_text() if env_file.exists() else ''
for name in ('HTTP_PROXY','HTTPS_PROXY'):
    key='PI_'+name
    if any(line.startswith(key+'=') for line in env_text.splitlines()):continue
    value=os.environ.get(key) or os.environ.get(name) or os.environ.get(name.lower())
    if not value:continue
    parsed=urlsplit(value)
    if parsed.hostname in ('127.0.0.1','localhost','::1'):
        parsed=parsed._replace(netloc=parsed.netloc.replace(parsed.hostname,'host.docker.internal'))
    env_text+='\n'+key+'='+urlunsplit(parsed)+'\n'
env_file.write_text(env_text);env_file.chmod(0o600)
subprocess.run(['docker', 'compose', 'up', '-d', '--no-deps', 'pi-worker'], cwd=ROOT, check=True)
legacy = Path.home()/'Library/LaunchAgents/local.health.feedback-worker.plist'
if legacy.exists():
    subprocess.run(['launchctl','bootout',f'gui/{os.getuid()}',str(legacy)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    legacy.unlink()
agent = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
agent.parent.mkdir(parents=True, exist_ok=True)
job = {'Label': LABEL, 'ProgramArguments': [sys.executable, str(ROOT / 'scripts/feedback-worker.py')],
       'WorkingDirectory': str(ROOT), 'RunAtLoad': True, 'KeepAlive': True,
       'ThrottleInterval': 15, 'StandardOutPath': str(DATA/'coordinator.log'),
       'StandardErrorPath': str(DATA/'coordinator-error.log'),
       'EnvironmentVariables': {'PATH': os.environ.get('PATH', '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')}}
# Preserve the existing local proxy settings for provider calls in launchd.
for name in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'):
    if os.environ.get(name):job['EnvironmentVariables'][name]=os.environ[name]
job['EnvironmentVariables'].update(coordinator_flutter_environment())
agent.write_bytes(plistlib.dumps(job))
agent.chmod(0o600)
domain = f'gui/{os.getuid()}'
subprocess.run(['launchctl','bootout',domain,str(agent)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(['launchctl','bootstrap',domain,str(agent)], check=True)
print('反馈协调进程与开发容器已启动。')
