#!/usr/bin/env python3
"""定时把名字含“羽毛球”的活动类型修正为 badminton。

由 launchd 任务 com.garmin.fix-badminton-activity-types 每日调用，
输出写入 ~/Library/Logs/garmin-badminton-activity-types.log。

用法：
    garmin-mcp/.venv/bin/python3 scripts/fix_badminton_activity_types.py            # 实际修正
    garmin-mcp/.venv/bin/python3 scripts/fix_badminton_activity_types.py --dry-run   # 只预览
"""

import argparse
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "garmin-mcp" / "src"))

os.environ.setdefault("GARMIN_CONFIG_PATH", str(ROOT / "garmin-mcp" / "config" / "garmin.json"))

from garmin_mcp.client import GarminClient  # noqa: E402

RETRIES = 3
RETRY_WAIT_SECONDS = 30


def fix_with_retry(start_date: str, end_date: str, name_contains: str, dry_run: bool) -> dict:
    """Garmin 登录偶发 SSL/网络抖动，失败后按固定间隔重试。"""
    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            # 每次尝试都用新客户端，避免复用登录失败的会话
            client = GarminClient()
            return client.fix_badminton_activity_types(
                start_date=start_date,
                end_date=end_date,
                name_contains=name_contains,
                dry_run=dry_run,
            )
        except Exception as error:  # noqa: BLE001 - 网络异常统一重试
            last_error = error
            print(f"第 {attempt}/{RETRIES} 次尝试失败：{error}", flush=True)
            if attempt < RETRIES:
                time.sleep(RETRY_WAIT_SECONDS)
    raise last_error


def main() -> int:
    parser = argparse.ArgumentParser(description="把名字含“羽毛球”的活动类型修正为 badminton")
    parser.add_argument("--start-date", default=None, help="YYYY-MM-DD，默认一年前")
    parser.add_argument("--end-date", default=None, help="YYYY-MM-DD，默认今天")
    parser.add_argument("--name-contains", default="羽毛球", help="活动名关键字，默认“羽毛球”")
    parser.add_argument("--dry-run", action="store_true", help="只列出候选，不修改 Garmin")
    args = parser.parse_args()

    end_date = args.end_date or datetime.now().strftime("%Y-%m-%d")
    start_date = args.start_date or (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    try:
        result = fix_with_retry(start_date, end_date, args.name_contains, args.dry_run)
    except Exception as error:  # noqa: BLE001 - 定时任务需要记录失败原因
        print(f"失败：{error}")
        return 1

    if result.get("error"):
        print(f"失败：{result['error']}")
        return 1

    print(
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] "
        f"{'预览' if args.dry_run else '执行'} 区间 {start_date}~{end_date} "
        f"扫描 {result['scanned']} 场，命中 {result['matched']} 场，"
        f"修改 {result['updated']} 场，跳过 {result['skipped']} 场，错误 {len(result['errors'])} 场"
    )
    for item in result["activities"]:
        print(
            f"  - {item['activity_id']} {item['activity_name']} {item['start_time_local']} "
            f"{item['from_type'].get('typeKey')} -> {item['to_type'].get('typeKey')} [{item['status']}]"
        )

    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
