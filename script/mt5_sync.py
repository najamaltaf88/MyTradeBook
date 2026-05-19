#!/usr/bin/env python3
"""
MyTradeBook MT5 Python sync.

Dependencies:
  pip install MetaTrader5 pandas requests

Run from the project root:
  python script/mt5_sync.py
"""

from __future__ import annotations

import argparse
import json
import platform
import struct
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = SCRIPT_DIR / "mt5_accounts.json"
MAX_TRADES_PER_REQUEST = 500


def require_windows_64_bit() -> None:
    if platform.system().lower() != "windows":
        print("ERROR: MetaTrader5 Python sync is supported on Windows only.")
        sys.exit(1)

    if struct.calcsize("P") * 8 != 64:
        print("ERROR: MetaTrader5 requires 64-bit Python. Install Python x64 and retry.")
        sys.exit(1)


def load_dependencies():
    try:
        import MetaTrader5 as mt5  # type: ignore
        import pandas as pd  # type: ignore
        import requests  # type: ignore
    except ImportError as exc:
        print("ERROR: Missing dependency.")
        print("Install dependencies with: pip install MetaTrader5 pandas requests")
        print(f"Details: {exc}")
        sys.exit(1)

    return mt5, pd, requests


def parse_datetime(value: str | None, default: datetime) -> datetime:
    if not value:
        return default

    cleaned = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def iso_from_epoch(epoch_seconds: Any) -> str:
    return datetime.fromtimestamp(int(epoch_seconds), tz=timezone.utc).isoformat()


def normalize_server_url(value: str | None) -> str:
    server_url = (value or "http://localhost:5000").strip().rstrip("/")
    if not server_url:
        raise ValueError("server_url is required")
    return f"{server_url}/api/mt5-sync/trades"


def chunks(items: list[dict[str, Any]], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


@dataclass
class AccountResult:
    account_id: str
    fetched: int = 0
    posted: int = 0
    inserted: int = 0
    skipped: int = 0
    errors: int = 0


def validate_account(raw: dict[str, Any], index: int) -> dict[str, Any]:
    required_fields = ["login", "password", "server", "account_id", "api_key"]
    missing = [field for field in required_fields if raw.get(field) in (None, "")]
    if missing:
        raise ValueError(f"Account #{index + 1} missing required field(s): {', '.join(missing)}")

    return {
        "login": int(raw["login"]),
        "password": str(raw["password"]),
        "server": str(raw["server"]),
        "account_id": str(raw["account_id"]),
        "api_key": str(raw["api_key"]),
        "server_url": raw.get("server_url"),
        "date_from": raw.get("date_from"),
        "date_to": raw.get("date_to"),
    }


def map_deals_to_trades(deals: Any, account_id: str, pd: Any) -> list[dict[str, Any]]:
    if not deals:
        return []

    rows = [deal._asdict() if hasattr(deal, "_asdict") else dict(deal) for deal in deals]
    frame = pd.DataFrame(rows)
    if frame.empty:
        return []

    frame = frame[frame["type"].isin([0, 1])]
    if frame.empty:
        return []

    trades: list[dict[str, Any]] = []
    for row in frame.to_dict("records"):
        symbol = str(row.get("symbol") or "").strip()
        if not symbol:
            continue

        trades.append({
            "account_id": account_id,
            "external_id": str(row.get("ticket")),
            "symbol": symbol,
            "direction": "BUY" if int(row.get("type")) == 0 else "SELL",
            "open_time": iso_from_epoch(row.get("time")),
            "open_price": float(row.get("price") or 0),
            "lot_size": float(row.get("volume") or 0),
            "profit": float(row.get("profit") or 0),
            "commission": float(row.get("commission") or 0),
            "swap": float(row.get("swap") or 0),
            "notes": str(row.get("comment") or ""),
        })

    return trades


def post_trades(session: Any, requests: Any, url: str, api_key: str, trades: list[dict[str, Any]]) -> dict[str, int]:
    totals = {"posted": 0, "inserted": 0, "skipped": 0, "errors": 0}
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for batch_number, batch in enumerate(chunks(trades, MAX_TRADES_PER_REQUEST), start=1):
        try:
            response = session.post(url, headers=headers, json=batch, timeout=60)
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            print(f"  Batch {batch_number}: FAILED request error: {exc}")
            totals["errors"] += len(batch)
            continue
        except ValueError as exc:
            print(f"  Batch {batch_number}: FAILED invalid JSON response: {exc}")
            totals["errors"] += len(batch)
            continue

        inserted = int(payload.get("inserted") or 0)
        skipped = int(payload.get("skipped") or 0)
        batch_errors = payload.get("errors") or []
        error_count = len(batch_errors) if isinstance(batch_errors, list) else 0

        totals["posted"] += len(batch)
        totals["inserted"] += inserted
        totals["skipped"] += skipped
        totals["errors"] += error_count

        print(
            f"  Batch {batch_number}: posted={len(batch)} "
            f"inserted={inserted} skipped={skipped} errors={error_count}"
        )

        if isinstance(batch_errors, list):
            for item in batch_errors[:5]:
                print(f"    Error: {item}")

    return totals


def sync_account(raw_account: dict[str, Any], index: int, config: dict[str, Any], mt5: Any, pd: Any, requests: Any) -> AccountResult:
    account = validate_account(raw_account, index)
    result = AccountResult(account_id=account["account_id"])
    print(f"\nAccount {index + 1}: {account['account_id']} ({account['server']} / {account['login']})")

    date_to = parse_datetime(account.get("date_to") or config.get("date_to"), datetime.now(timezone.utc))
    date_from = parse_datetime(
        account.get("date_from") or config.get("date_from"),
        date_to - timedelta(days=int(config.get("days_back") or 30)),
    )

    endpoint = normalize_server_url(account.get("server_url") or config.get("server_url"))

    mt5.shutdown()
    if not mt5.initialize(login=account["login"], password=account["password"], server=account["server"]):
        last_error = mt5.last_error()
        raise RuntimeError(f"MT5 initialize failed: {last_error}")

    print(f"  Connected. Fetching deals from {date_from.isoformat()} to {date_to.isoformat()}")
    deals = mt5.history_deals_get(date_from, date_to)
    if deals is None:
        last_error = mt5.last_error()
        raise RuntimeError(f"history_deals_get failed: {last_error}")

    trades = map_deals_to_trades(deals, account["account_id"], pd)
    result.fetched = len(trades)
    print(f"  Trade count: {result.fetched}")

    if trades:
        session = requests.Session()
        totals = post_trades(session, requests, endpoint, account["api_key"], trades)
        result.posted = totals["posted"]
        result.inserted = totals["inserted"]
        result.skipped = totals["skipped"]
        result.errors = totals["errors"]

    print(
        f"  Account result: success inserted={result.inserted} "
        f"skipped={result.skipped} errors={result.errors}"
    )
    return result


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        print(f"ERROR: Config file not found: {path}")
        print(f"Copy {SCRIPT_DIR / 'mt5_accounts.example.json'} to {path} and fill in your details.")
        sys.exit(1)

    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    accounts = config.get("accounts")
    if not isinstance(accounts, list) or not accounts:
        print("ERROR: Config must include a non-empty accounts array.")
        sys.exit(1)

    return config


def main() -> int:
    require_windows_64_bit()
    mt5, pd, requests = load_dependencies()

    parser = argparse.ArgumentParser(description="Sync MT5 trade history to MyTradeBook without an EA.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to mt5_accounts.json")
    parser.add_argument("--from", dest="date_from", help="Override date_from, for example 2026-05-01")
    parser.add_argument("--to", dest="date_to", help="Override date_to, for example 2026-05-19")
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    config = load_config(config_path)
    if args.date_from:
        config["date_from"] = args.date_from
    if args.date_to:
        config["date_to"] = args.date_to

    total_accounts = len(config["accounts"])
    total_trades = 0
    total_inserted = 0
    total_skipped = 0
    total_errors = 0

    print(f"MyTradeBook MT5 Python sync")
    print(f"Config: {config_path}")
    print(f"Accounts: {total_accounts}")

    try:
        for index, raw_account in enumerate(config["accounts"]):
            try:
                result = sync_account(raw_account, index, config, mt5, pd, requests)
                total_trades += result.fetched
                total_inserted += result.inserted
                total_skipped += result.skipped
                total_errors += result.errors
            except Exception as exc:
                total_errors += 1
                account_id = raw_account.get("account_id", f"#{index + 1}") if isinstance(raw_account, dict) else f"#{index + 1}"
                print(f"\nAccount {account_id}: FAILED {exc}")
            finally:
                mt5.shutdown()
    finally:
        mt5.shutdown()

    print("\nSummary")
    print(f"  Total accounts: {total_accounts}")
    print(f"  Total trades found: {total_trades}")
    print(f"  Total trades synced: {total_inserted}")
    print(f"  Total duplicates skipped: {total_skipped}")
    print(f"  Errors: {total_errors}")

    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
