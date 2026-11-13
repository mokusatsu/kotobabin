"""Generate action-by-action expected state from the unchanged canonical Python model."""
import importlib.util
import json
from pathlib import Path
import re
import sys
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('economy_model', root / 'spec/initial/tools/economy_model.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

def camel(key):
    return re.sub(r'_([a-z])', lambda m: m[1].upper(), key)

def convert(value):
    if isinstance(value, dict):
        return {camel(k): convert(v) for k, v in value.items()}
    if isinstance(value, list):
        return [convert(v) for v in value]
    return value

def project(model):
    s = model.snapshot()
    keys = ['economy_version', 'clock_ms', 'saved_wall_ms', 'city_sequence', 'city_id', 'landscape', 'coins_micro',
            'city_arrived_micro', 'packaging_level', 'blueprints', 'research', 'synergies', 'districts', 'last_session_summary', 'construction_history']
    result = {k: s[k] for k in keys}
    result.update(s['lifetime'])
    result['used_session_ids'] = sorted(s['used_session_ids'])
    result['fact_keys'] = sorted(s['fact_ledger'])
    return convert(result)

scenarios = []
def scenario(name, setup, actions):
    m = module.EconomyModel()
    setup(m)
    before = project(m)
    snapshots = []
    for action in actions:
        result = getattr(m, action[0])(**action[1])
        snapshots.append(dict(action=action, expected=project(m)))
    scenarios.append(dict(name=name, initial=before, steps=snapshots))

scenario('session-materials-summary-and-idempotence', lambda m: None, [
    ['begin_session', dict(session_id='delivery')],
    ['complete_word', dict(session_id='delivery', fact_sequence=1, base_length=3, mistakes=2, city_id='city-1')],
    ['complete_word', dict(session_id='delivery', fact_sequence=1, base_length=3, mistakes=2, city_id='city-1')],
    ['ship_cargo', dict(session_id='delivery', fact_sequence=2, score_sum=230, cargo_count=3, reason='manual', city_id='city-1', at_ms=1000)],
    ['end_session', dict(at_ms=2000)],
    ['ship_cargo', dict(session_id='delivery', fact_sequence=2, score_sum=230, cargo_count=3, reason='manual', city_id='city-1')],
    ['end_session', {}], ['advance_to', dict(target_ms=10000)], ['advance_to', dict(target_ms=10000)]])

def stock(m):
    m.coins_micro = 10000*m.unit
    m.districts['residential'].queue_micro = 500*m.unit
scenario('plans-investment-unlock-and-boundaries', stock, [
    ['purchase', dict(kind='packaging', at_ms=7500)],
    ['start_plan', dict(district_id='residential')],
    ['pause_plan', dict(district_id='residential')],
    ['advance', dict(elapsed_ms=60000)],
    ['resume_plan', dict(district_id='residential')],
    ['open_district', dict(district_id='market')],
    ['purchase', dict(kind='shops', quantity=10, district_id='residential')],
    ['purchase', dict(kind='crews', quantity=10, district_id='market')],
    ['begin_session', dict(session_id='market-trip', district_id='market', mode='practice')],
    ['complete_word', dict(session_id='market-trip', fact_sequence=1, base_length=10, city_id='city-1')],
    ['end_session', {}], ['advance', dict(elapsed_ms=10000)]])

def mature(m):
    m.coins_micro = 200000*m.unit
    for d in m.districts.values():
        d.open, d.stage, d.shops, d.crews, d.plan = True, 3, 1, 10, None
        d.stock_micro = 20000*m.unit
        d.queue_micro = 100*m.unit
    m.city_arrived_micro = 100000*m.unit
    m.blueprints = 4
scenario('railway-synergies-research-restart', mature, [
    ['buy_railway', dict(district_id='residential')],
    ['buy_synergy', dict(synergy_id='joint_delivery')],
    ['buy_synergy', dict(synergy_id='sorting_network')],
    ['buy_synergy', dict(synergy_id='tourism_service')],
    ['buy_research', dict(kind='materials')], ['buy_research', dict(kind='logistics')], ['buy_research', dict(kind='commerce')],
    ['advance', dict(elapsed_ms=1000)],
    ['start_new_city', dict(confirmed=True, location='RESULT', landscape='seaside')],
    ['complete_word', dict(session_id='old', fact_sequence=0, base_length=5, city_id='city-1')],
    ['buy_research', dict(kind='materials')],
    ['begin_session', dict(session_id='new-research')],
    ['complete_word', dict(session_id='new-research', fact_sequence=0, base_length=3, city_id='city-2')], ['end_session', {}]])

def offline(m):
    m.districts['residential'].queue_micro = 30*m.unit
scenario('offline-restoration-high-water-mark', offline, [
    ['restore_at', dict(wall_ms=129600000)], ['restore_at', dict(wall_ms=129600000)],
    ['restore_at', dict(wall_ms=1000)], ['restore_at', dict(wall_ms=129601000)]])
Path(__file__).with_name('transaction_fixtures.json').write_text(json.dumps(scenarios, ensure_ascii=False, indent=2)+'\n')
