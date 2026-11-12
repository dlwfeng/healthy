#!/usr/bin/env python3
"""Deploy merged feedback code through existing services; user performs acceptance.

No model, branch creation, comment parsing, extra service, or functional test runner.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('feedback_worker',ROOT/'scripts/feedback-worker.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation',choices=('deploy','rollback'),default='deploy')
    parser.add_argument('--record',type=Path,help='回退所需的上一版本记录')
    parser.add_argument('--target',choices=('web','mobile','both'),required=True)
    parser.add_argument('--changed-file',action='append',default=[])
    parser.add_argument('--notes',default='意见反馈更新')
    args=parser.parse_args()
    if args.operation=='rollback':
        if not args.record or not args.record.resolve().is_relative_to((worker.DATA/'deliveries').resolve()):
            parser.error('回退记录必须位于项目 deliveries 目录')
        worker.restore_delivery(json.loads(args.record.read_text()))
    for command in worker.deployment_commands(args.changed_file,args.target,args.notes):
        subprocess.run(command,cwd=ROOT,check=True)
    print('已部署到现有服务，等待用户验收。',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        reason=str(error) if isinstance(error,ValueError) else '部署命令失败，请检查本机部署日志'
        print(json.dumps({'type':'feedback_delivery_error','reason':reason},ensure_ascii=False),flush=True)
        raise SystemExit(1)
