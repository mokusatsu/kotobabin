"""Refresh inspectable TS parity fixtures directly from the unchanged Python reference."""
import importlib.util
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('economy_model', root / 'spec/initial/tools/economy_model.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
Model = module.EconomyModel
m = Model()
prices = []
for kind in ('packaging', 'crews', 'shops'):
    for district in ([None] if kind == 'packaging' else list(m.districts)):
        for current in range(1 if kind == 'crews' else 0, 50):
            prices.append([kind, current, district, str(m.next_price_coins(kind, current, district))])
materials = []
for level in (0, 1, 9, 10, 24, 25, 49, 50):
    for rank in (0, 1, 5):
        m = Model()
        m.packaging_level = level
        m.research['materials'] = rank
        m.begin_session('parity')
        word = m.complete_word('parity', 1, 3, city_id=m.city_id)
        shipment = m.ship_cargo('parity', 2, 230, 3, 'manual', city_id=m.city_id)
        materials.append(dict(level=level, rank=rank, word=word['generated_micro'], shipment=shipment['generated_micro']))

def summary(m):
    return dict(clockMs=m.clock_ms, savedWallMs=m.saved_wall_ms, coinsMicro=str(m.coins_micro),
                cityArrivedMicro=str(m.city_arrived_micro), deliveryCoinsMicro=str(m.lifetime['delivery_coins_micro']),
                shopCoinsMicro=str(m.lifetime['shop_coins_micro']), districts={id: dict(stage=d.stage, shops=d.shops,
                queueMicro=str(d.queue_micro), stockMicro=str(d.stock_micro), arrivedMicro=str(d.arrived_micro),
                planReservedMicro=str(d.plan.reserved_micro) if d.plan else None) for id, d in m.districts.items()})
clock = []
for elapsed, queue, reserved, paused, offline in [(60000, 30_000_000, 0, False, False),
    (2, 6250, 29_993_750, False, False), (129600000, 30_000_000, 0, False, True),
    (60000, 100_000_000, 10_000_000, True, False)]:
    m = Model()
    d = m.districts['residential']
    d.queue_micro = queue
    d.plan.reserved_micro = reserved
    d.plan.paused = paused
    if offline:
        m.restore_at(elapsed)
        m.restore_at(elapsed)
    else:
        m.advance(elapsed)
    clock.append(dict(elapsed=elapsed, queue=str(queue), reserved=str(reserved), paused=paused,
                      offline=offline, expected=summary(m)))
output = dict(source='spec/initial/tools/economy_model.py', prices=prices, materials=materials, clock=clock)
Path(__file__).with_name('reference_fixtures.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
