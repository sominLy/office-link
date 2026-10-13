#!/usr/bin/env python3
"""Supabase Management API로 SQL을 실행한다 — 대시보드 SQL Editor의 Run과 같은 방식.

사용:
  SUPABASE_ACCESS_TOKEN=… PROJECT_REF=… python3 supabase/scripts/mgmt_sql.py apply supabase/migrations/024_study_rooms.sql
  SUPABASE_ACCESS_TOKEN=… PROJECT_REF=… python3 supabase/scripts/mgmt_sql.py check supabase/queries/launch_check.sql

토큰은 supabase.com → Account → Access Tokens의 개인 토큰이다. DB 비밀번호는 필요 없다.
GitHub Actions(.github/workflows/deploy-supabase.yml)가 이 스크립트를 부른다.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def run_sql(sql: str):
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    ref = os.environ.get("PROJECT_REF")
    if not token or not ref:
        sys.exit("SUPABASE_ACCESS_TOKEN과 PROJECT_REF가 필요해요")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            body = res.read().decode("utf-8")
            return json.loads(body) if body else []
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        sys.exit(f"Supabase가 거부했어요 ({e.code}): {detail[:800]}")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("apply", "check"):
        sys.exit(__doc__)
    cmd, path = sys.argv[1], sys.argv[2]
    with open(path, encoding="utf-8") as f:
        sql = f.read()
    if cmd == "apply":
        run_sql(sql)
        print(f"✅ {os.path.basename(path)} 적용")
        return
    rows = run_sql(sql)
    bad = 0
    for r in rows:
        status, item, fix = r.get("상태", "?"), r.get("항목", ""), r.get("고칠 일", "")
        line = f"{status} {item}" + (f" — {fix}" if fix else "")
        print(line)
        if status != "✅":
            bad += 1
            # GitHub Actions 실행 요약에 띄운다
            print(f"::warning title=launch_check::{item} — {fix}")
    print(f"{len(rows) - bad}/{len(rows)} 통과")


if __name__ == "__main__":
    main()
