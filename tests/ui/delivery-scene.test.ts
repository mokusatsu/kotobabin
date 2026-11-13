import { describe, expect, it } from 'vitest';
import wordsData from '../../spec/initial/data/words.json';
import { CityEconomy, initialCityState } from '../../src/economy';
import { GameSession, type SessionFact, type Word } from '../../src/typing';
import { DeliverySceneController, createDeliverySceneState, deliveryBatchPosition, deliveryPosition, projectDeliveryScene, renderDeliveryScene } from '../../src/ui/delivery-scene';

const word = (wordsData.words as Word[]).find(item => item.reading === 'ねこ')!;
function fixture() {
  const city = new CityEconomy(initialCityState());
  const session = new GameSession({ words: [word], sessionId: 'scene-session' });
  city.beginSession(session.sessionId, 'residential', 'normal', 0);
  const scene = new DeliverySceneController(city.snapshot(), 'residential');
  const flush = () => {
    const facts = session.drainEvents();
    for (const fact of facts) {
      const identity = { cityId: city.state.cityId, sessionId: session.sessionId, factSequence: fact.factSequence, atMs: city.state.clockMs };
      if (fact.type === 'WordCompleted') city.completeWord({ ...identity, baseLength: fact.canonicalLength, mistakes: fact.mistakes });
      if (fact.type === 'DeliveryCommitted') city.shipCargo({ ...identity, scoreSum: fact.cargoCount * word.canonicalLength * 10, cargoCount: fact.cargoCount, reason: fact.reason });
    }
    scene.observe(session.sessionId, facts, session.snapshot(0), city.snapshot());
    return facts;
  };
  const complete = () => { for (const key of session.snapshot(0).remainingGuide) session.input(key, 0); return flush(); };
  return { city, session, scene, flush, complete };
}

describe('delivery scene projects confirmed typing and independent city transport', () => {
  it('sends base materials on completion before Space, then the separate bonus shipment without claiming arrival', () => {
    const { city, session, scene, complete, flush } = fixture();
    complete(); const base = scene.view();
    expect(base.words).toBe(1); expect(base.cargoCount).toBe(1); expect(base.dispatches).toBe(0);
    expect(base.queuedMicro).toBeGreaterThan(0n); expect(base.arrivedSinceMountMicro).toBe(0n);
    session.deliver(0); flush();
    expect(scene.view().dispatches).toBe(1); expect(scene.view().cargoCount).toBe(0);
    expect(scene.view().queuedMicro).toBeGreaterThan(base.queuedMicro);
    expect(scene.view().arrivedSinceMountMicro).toBe(0n);
    expect(deliveryPosition(scene.view())).toBe(0);
    expect(scene.view().queuedMicro).toBe(city.state.districts.residential.queueMicro);
  });
  it('dirty words still send base material but add no cargo, and mistakes clear the actual cargo rack', () => {
    const { session, scene, complete, flush } = fixture();
    complete(); session.input('z', 0); flush();
    expect(scene.view().cargoCount).toBe(0);
    const before = scene.view().queuedMicro; complete();
    expect(scene.view().wordKind).toBe('dirty'); expect(scene.view().words).toBe(2);
    expect(scene.view().queuedMicro).toBeGreaterThan(before); expect(scene.view().cargoCount).toBe(0);
  });
  it('full fifth completion is one base parcel plus one distinct dispatch, replay remains silent', () => {
    const { scene, session, city, complete } = fixture();
    let final: SessionFact[] = [];
    for (let i = 0; i < 5; i++) final = complete();
    expect(final.map(f => f.type)).toEqual(['WordCompleted', 'DeliveryCommitted']);
    expect(scene.view().words).toBe(5); expect(scene.view().dispatches).toBe(1);
    const before = scene.view(); scene.observe(session.sessionId, final, session.snapshot(0), city.snapshot());
    expect(scene.view()).toEqual(before);
  });
  it('uses only actual destination arrivals, independent of typing pause or cosmetic settings', () => {
    const { scene, city, session, complete } = fixture(); complete();
    session.pause(0); scene.observe(session.sessionId, [], session.snapshot(0), city.snapshot());
    scene.setReducedMotion(true); scene.detach();
    city.advance(1000); scene.updateCity(city.snapshot());
    const state = scene.view();
    expect(state.paused).toBe(true); expect(state.reducedMotion).toBe(true);
    expect(state.arrivedSinceMountMicro).toBe(city.state.districts.residential.arrivedMicro);
    expect(state.arrivedSinceMountMicro).toBeGreaterThan(0n); expect(state.arrivalRevision).toBe(1);
    expect(deliveryPosition(state)).toBeGreaterThan(0);
    const canonical = city.snapshot(); scene.setPaused(false); scene.setReducedMotion(false);
    expect(city.snapshot()).toEqual(canonical);
  });
  it('subscribe-before-facts ordering and repeated updates preserve each arrival exactly once', () => {
    const { scene, city, session, complete } = fixture(); complete();
    city.advance(500); const update = city.snapshot(); scene.updateCity(update);
    const arrived = scene.view();
    scene.observe(session.sessionId, [], session.snapshot(0), update); scene.updateCity(update);
    expect(scene.view().arrivalRevision).toBe(arrived.arrivalRevision);
    expect(scene.view().lastArrivalMicro).toBe(arrived.lastArrivalMicro);
    expect(scene.view().arrivedSinceMountMicro).toBe(arrived.arrivedSinceMountMicro);
  });
  it('existing queues stay visible on RESULT and arrivals from other districts are not misattributed', () => {
    const city = initialCityState(); city.districts.residential.queueMicro = 9000000n;
    const scene = new DeliverySceneController(city, 'residential');
    city.districts.market.arrivedMicro = 1200000n; city.arrivedMicro = 1200000n;
    scene.updateCity(city);
    expect(scene.view().arrivedSinceMountMicro).toBe(0n);
    expect(scene.view().queuedMicro).toBe(9000000n);
    expect(scene.render()).toContain('輸送待ち 9資材');
  });
  it('new generation never rewinds the stable existing cart and partial throughput cannot land it', () => {
    const { scene, city, complete } = fixture(); complete();
    city.advance(1); scene.updateCity(city.snapshot());
    const batch = scene.view().batches[0]; const progress = deliveryBatchPosition(batch);
    expect(progress).toBeGreaterThan(0); expect(progress).toBeLessThan(1);
    expect(scene.view().arrivalRevision).toBe(0);
    complete();
    const same = scene.view().batches.find(item => item.id === batch.id)!;
    expect(deliveryBatchPosition(same)).toBe(progress);
    expect(same.amountMicro).toBe(batch.amountMicro); expect(same.remainingMicro).toBe(batch.remainingMicro);
    expect(scene.view().batches.length).toBe(2);
    city.advance(180000); scene.updateCity(city.snapshot());
    expect(scene.view().queuedMicro).toBe(0n);
    expect(scene.view().batches.every(item => item.remainingMicro === 0n)).toBe(true);
    expect(scene.view().arrivalRevision).toBe(2);
    expect(scene.view().batches.every(item => deliveryBatchPosition(item) === 1)).toBe(true);
  });
  it('bounds transport groups to six while conserving exact FIFO amounts under many words', () => {
    const { scene, city, complete } = fixture();
    for (let i = 0; i < 30; i++) complete();
    const state = scene.view();
    expect(state.batches.length).toBeLessThanOrEqual(6);
    expect(state.batches.some(batch => batch.combined)).toBe(true);
    expect(state.batches.reduce((total, batch) => total + batch.remainingMicro, 0n)).toBe(state.queuedMicro);
    city.advance(1); scene.updateCity(city.snapshot());
    expect(scene.view().batches.reduce((total, batch) => total + batch.remainingMicro, 0n)).toBe(city.state.districts.residential.queueMicro);
    const copy = scene.view(); copy.batches[0].remainingMicro = 0n;
    expect(scene.view().batches[0].remainingMicro).toBeGreaterThan(0n);
  });
  it('a city reset establishes new counters rather than showing an old-city arrival', () => {
    const old = initialCityState(); old.districts.residential.arrivedMicro = 500n;
    const state = createDeliverySceneState(old, 'residential');
    const next = initialCityState(); next.cityId = 'city-2';
    const projected = projectDeliveryScene({ ...state, arrivedSinceMountMicro: 200n, cargoCount: 3 }, next);
    expect(projected.arrivedSinceMountMicro).toBe(0n); expect(projected.cargoCount).toBe(0);
    expect(projected.cityId).toBe('city-2'); expect(projected.arrivalRevision).toBe(0);
  });
  it('does not mutate inputs or use elapsed-time clocks; render uses real warehouse/cart/district artwork', () => {
    const city = initialCityState(); const before = structuredClone(city);
    const state = createDeliverySceneState(city, 'residential'); const saved = structuredClone(state);
    for (let i = 0; i < 100; i++) expect(projectDeliveryScene(state, city)).toEqual(state);
    expect(city).toEqual(before); expect(state).toEqual(saved);
    const html = renderDeliveryScene(city, 'residential');
    expect(html).toContain('city_shared/city_hub.webp'); expect(html).toContain('vehicle/vehicle_cart_rear.webp');
    expect(html).toContain('city_plot/city_plot_empty.webp'); expect(html).toContain('まとめ便 0 / 5');
    expect(html).toContain('到着 0資材'); expect(html).not.toContain('setTimeout');
  });
});
