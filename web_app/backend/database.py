# -*- coding: utf-8 -*-
"""Supabase database client for instrument sets and verification logs."""

import httpx
from datetime import datetime
from backend.config import SUPABASE_URL, SUPABASE_KEY


def _headers() -> dict:
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }


def _url(table: str) -> str:
    return f'{SUPABASE_URL}/rest/v1/{table}'


# ── Instrument Sets ──

async def get_all_sets() -> list[dict]:
    """Fetch all instrument sets with their checklist items."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            _url('instrument_sets'),
            headers=_headers(),
            params={'select': '*', 'order': 'display_name.asc'},
        )
        r.raise_for_status()
        sets = r.json()

        # Fetch checklist items for each set
        for s in sets:
            r2 = await client.get(
                _url('checklist_items'),
                headers=_headers(),
                params={'select': '*', 'set_id': f'eq.{s["id"]}', 'order': 'sort_order.asc'},
            )
            r2.raise_for_status()
            s['checklist'] = r2.json()

        return sets


async def get_set(set_id: str) -> dict | None:
    """Fetch a single instrument set with its checklist."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            _url('instrument_sets'),
            headers=_headers(),
            params={'select': '*', 'id': f'eq.{set_id}'},
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            return None
        s = data[0]

        r2 = await client.get(
            _url('checklist_items'),
            headers=_headers(),
            params={'select': '*', 'set_id': f'eq.{set_id}', 'order': 'sort_order.asc'},
        )
        r2.raise_for_status()
        s['checklist'] = r2.json()
        return s


async def create_set(data: dict) -> dict:
    """Create a new instrument set."""
    async with httpx.AsyncClient() as client:
        set_data = {
            'id': data['id'],
            'display_name': data['display_name'],
            'display_name_th': data.get('display_name_th', ''),
            'reference_image_url': data.get('reference_image_url', ''),
        }
        r = await client.post(_url('instrument_sets'), headers=_headers(), json=set_data)
        r.raise_for_status()
        created = r.json()[0]

        # Insert checklist items
        for i, item in enumerate(data.get('checklist', [])):
            item_data = {
                'set_id': data['id'],
                'item_name': item['item_name'],
                'item_name_th': item.get('item_name_th', ''),
                'quantity': item.get('quantity', 1),
                'mode': item.get('mode', 'exact'),
                'sort_order': i,
            }
            await client.post(_url('checklist_items'), headers=_headers(), json=item_data)

        created['checklist'] = data.get('checklist', [])
        return created


async def update_set(set_id: str, data: dict) -> dict:
    """Update an instrument set and its checklist."""
    async with httpx.AsyncClient() as client:
        update_data = {
            'display_name': data['display_name'],
            'display_name_th': data.get('display_name_th', ''),
            'reference_image_url': data.get('reference_image_url', ''),
            'updated_at': datetime.utcnow().isoformat(),
        }
        r = await client.patch(
            _url('instrument_sets'),
            headers=_headers(),
            params={'id': f'eq.{set_id}'},
            json=update_data,
        )
        r.raise_for_status()

        # Replace checklist: delete old, insert new
        await client.delete(
            _url('checklist_items'),
            headers=_headers(),
            params={'set_id': f'eq.{set_id}'},
        )
        for i, item in enumerate(data.get('checklist', [])):
            item_data = {
                'set_id': set_id,
                'item_name': item['item_name'],
                'item_name_th': item.get('item_name_th', ''),
                'quantity': item.get('quantity', 1),
                'mode': item.get('mode', 'exact'),
                'sort_order': i,
            }
            await client.post(_url('checklist_items'), headers=_headers(), json=item_data)

        return await get_set(set_id)


async def delete_set(set_id: str) -> bool:
    """Delete an instrument set and its checklist items."""
    async with httpx.AsyncClient() as client:
        await client.delete(
            _url('checklist_items'),
            headers=_headers(),
            params={'set_id': f'eq.{set_id}'},
        )
        r = await client.delete(
            _url('instrument_sets'),
            headers=_headers(),
            params={'id': f'eq.{set_id}'},
        )
        return r.status_code == 200 or r.status_code == 204


# ── Verification Logs ──

async def log_verification(log_data: dict) -> dict:
    """Save a verification result to the log."""
    async with httpx.AsyncClient() as client:
        r = await client.post(_url('verification_logs'), headers=_headers(), json=log_data)
        r.raise_for_status()
        return r.json()[0]


async def get_logs(limit: int = 50) -> list[dict]:
    """Get recent verification logs."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            _url('verification_logs'),
            headers=_headers(),
            params={
                'select': '*',
                'order': 'created_at.desc',
                'limit': str(limit),
            },
        )
        r.raise_for_status()
        return r.json()


async def get_dashboard_stats() -> dict:
    """Get stats for dashboar: counts by status, recent activity."""
    logs = await get_logs(limit=500)
    total = len(logs)
    pass_count = sum(1 for l in logs if l.get('status') == 'PASS')
    fail_count = sum(1 for l in logs if l.get('status') == 'FAIL')
    uncertain_count = sum(1 for l in logs if l.get('status') == 'UNCERTAIN')
    error_count = sum(1 for l in logs if l.get('status') == 'ERROR')

    # Daily breakdown (last 7 days)
    from collections import Counter
    daily = Counter()
    for l in logs:
        day = l.get('created_at', '')[:10]
        if day:
            daily[day] += 1

    return {
        'total': total,
        'pass_count': pass_count,
        'fail_count': fail_count,
        'uncertain_count': uncertain_count,
        'error_count': error_count,
        'pass_rate': round(pass_count / total * 100, 1) if total > 0 else 0,
        'daily': dict(sorted(daily.items(), reverse=True)[:7]),
        'recent_logs': logs[:10],
    }
