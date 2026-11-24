import type { DistrictId, LandscapeId } from '@/contracts/types';

type Activity = 'smoke' | 'walker' | 'basket' | 'porter' | 'cart' | 'lantern' | 'petals' | 'leaves' | 'butterfly' | 'bird';
type Milestone = readonly [Activity, string];
export const districtLife: Record<DistrictId, readonly Milestone[]> = {
  residential: [['smoke', '屋根から炊事の煙がのぼる'], ['basket', '買い物かごを持った住人が通る'], ['walker', '公民館へ人が集まる'], ['lantern', '手提げ灯が通りを照らす'], ['leaves', '広場の木の葉が風に舞う']],
  market: [['basket', '市に買い物客がやってくる'], ['porter', '品物を抱えた人が店先を通る'], ['cart', '荷車が市場に品物を運ぶ'], ['lantern', '手提げ灯が店先を行き交う'], ['basket', '広場にもうひとり買い物客が加わる']],
  workshop: [['smoke', '工房の炉から煙がのぼる'], ['porter', '職人が材料を運ぶ'], ['cart', '共同工房に荷車が通う'], ['lantern', '職人が手提げ灯で作業庭を巡る'], ['porter', 'もうひとりの職人が製品を運ぶ']],
  park: [['butterfly', '園丁の小屋に蝶が遊びにくる'], ['petals', '小径に花びらが舞う'], ['walker', '温室の前を人が散歩する'], ['lantern', '手提げ灯が庭廊を巡る'], ['butterfly', '円庭でもう一羽の蝶が舞う']],
  station: [['walker', '駅前を旅客が歩く'], ['basket', '手荷物を持った旅客が加わる'], ['cart', '駅舎の前を荷車が往復する'], ['lantern', '駅員が手提げ灯で見回る'], ['porter', '荷物を運ぶ人が駅前を行き交う']],
  harbor: [['bird', '船着き場の上を水鳥が舞う'], ['walker', '水辺を人が散歩する'], ['cart', '倉庫へ荷車が通う'], ['lantern', '手提げ灯が倉庫通りを巡る'], ['bird', '広場の空にもう一羽の水鳥が加わる']],
};

type FacilityId = 'central_hub' | 'packaging' | 'research' | 'synergy';
export type TownSite = DistrictId | FacilityId;
const facilityLife: Record<FacilityId, readonly Activity[]> = {
  central_hub: ['porter', 'walker', 'cart', 'lantern', 'porter'],
  packaging: ['porter', 'cart', 'porter', 'lantern', 'cart'],
  research: ['walker', 'butterfly', 'porter', 'lantern', 'walker'],
  synergy: ['porter', 'walker', 'basket', 'cart', 'lantern'],
};

export type LifeSite = { id: TownSite; x: number; y: number; stage: number; roof: number };
type Actor = { kind: Activity; x: number; y: number; z: number; slot: number; phase: number; rooftop: boolean; anchorX: number; anchorY: number };

export function townActors(town: LandscapeId, sites: LifeSite[]) {
  const actors: Actor[] = [];
  function add(kind: Activity, x: number, y: number, z: number, slot: number, anchorX = x, anchorY = y) {
    actors.push({ kind, x, y, z, slot, phase: Math.abs(x * 0.17 + y * 0.31 + slot * 2.73),
      rooftop: kind === 'smoke', anchorX, anchorY });
  }
  if (town === 'riverside') {
    add('petals', -97, 50, 12, 0);
    add('petals', -55, -44, 13, 1);
  } else if (town === 'highland') {
    add('leaves', -99, -40, 15, 0);
    add('leaves', 51, -71, 16, 1);
  } else {
    add('bird', 87, -21, 36, 0);
    add('bird', 85, 40, 22, 1);
  }
  for (const { id, x, y, stage, roof } of sites) {
    const kinds = id in districtLife ? districtLife[id as DistrictId].map(([kind]) => kind) : facilityLife[id as FacilityId];
    kinds.slice(0, stage).forEach((kind, i) => {
      if (kind === 'smoke') {
        const chimney = town === 'highland';
        add(kind, x + (chimney ? 2.8 : 0), y - (chimney ? 5.6 : 4), chimney ? (20 + 2 * stage) * 0.8 : roof, i, x, y);
      } else if (kind === 'bird') add(kind, x, y, 19 + i, i);
      else if (kind === 'leaves' || kind === 'petals') add(kind, x - 8, y + 4, 10, i);
      else add(kind, x, y + 12 + (i % 3) * 2, kind === 'butterfly' ? 5 : 0, i);
    });
  }
  return actors;
}

type Ground = (x: number, y: number) => number;
type Project = (x: number, y: number, elevation: number) => { x: number; y: number };
export function lifeFrame(actors: Actor[], time: number, sin: number, cos: number, ground: Ground, project: Project) {
  return actors.map(actor => {
    const t = time + actor.phase;
    const { kind, slot } = actor;
    let { x, y, z } = actor;
    const cycle = t / (5.4 + slot * 0.28);
    const flying = kind === 'bird' || kind === 'butterfly';
    if (flying) {
      const span = kind === 'bird' ? 10 : 5;
      x += span * Math.sin(t * 0.76);
      y += span * 0.55 * Math.cos(t * 0.76);
      z += Math.sin(t * 2.2) * 1.6;
    } else if (kind !== 'smoke' && kind !== 'petals' && kind !== 'leaves') {
      x += Math.sin(cycle * Math.PI) * (9 + slot);
      y += Math.sin(cycle * Math.PI) * (slot % 2 ? 2 : -1.5);
    }
    const base = actor.rooftop ? ground(actor.anchorX, actor.anchorY) : ground(x, y);
    const pos = project(x, y, base + z);
    const depth = actor.rooftop ? actor.anchorX * sin + actor.anchorY * cos + 0.01 : x * sin + y * cos;
    return { ...pos, depth, kind, t, slot, direction: Math.cos(cycle * Math.PI) * cos >= 0 ? 1 : -1 };
  }).sort((a, b) => a.depth - b.depth);
}

type Pose = ReturnType<typeof lifeFrame>[number];
export function paintLife(ctx: CanvasRenderingContext2D, pose: Pose, scale: number, town: LandscapeId, windX: number, windY: number) {
  const { kind, t, slot, direction } = pose;
  const pixel = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  ctx.setTransform(scale, 0, 0, scale, Math.round(pose.x), Math.round(pose.y));
  if (kind === 'smoke' || kind === 'petals' || kind === 'leaves') {
    const smoke = kind === 'smoke';
    for (let i = 0; i < (smoke ? 4 : 5); i++) {
      const f = (t / (smoke ? 3.6 : 4.7) + i / (smoke ? 4 : 5)) % 1;
      const drift = (smoke ? 7 : 18) * f;
      const x = windX * drift + Math.sin(f * 6 + i) * (smoke ? 1 : 2);
      const y = windY * drift + (smoke ? -14 : 10) * f + (smoke ? 0 : Math.cos(f * 8 + i) * 2);
      ctx.globalAlpha = Math.min(1, f * 8, (1 - f) * 5) * (smoke ? 0.78 : 1);
      if (smoke) {
        const size = 2 + Math.floor(f * 3);
        pixel('#acb5ad', x, y + 1, size, 2);
        pixel('#f8eed7', x + 1, y, size, 2);
      } else {
        pixel(kind === 'petals' ? '#bf6478' : '#76823d', x, y + 1, 2, 1);
        pixel(kind === 'petals' ? '#ffd4d1' : '#d7cf68', x + 1, y, 2, 1);
      }
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'bird' || kind === 'butterfly') {
    const flap = Math.sin(t * (kind === 'bird' ? 5 : 9)) > 0 ? -1 : 1;
    const bird = kind === 'bird';
    const wing = bird ? '#fff5db' : slot % 2 ? '#f1a7ab' : '#ffcb63';
    pixel(bird ? '#526876' : '#7d5948', -1, 0, 3, 1);
    for (const side of [-1, 1]) {
      pixel(wing, side < 0 ? -3 : 1, flap, 2, bird ? 1 : 2);
      pixel(bird ? '#60737a' : '#af7555', side < 0 ? -4 : 3, flap * 2, 1, 1);
    }
  } else {
    const step = Math.sin(t * 7) > 0 ? 1 : 0;
    const coat = ['#337876', '#ac5946', '#546d95', '#916381', '#74824a'][slot];
    pixel('#62614955', -2, 0, 5, 1);
    pixel('#483f41', -2 + step, -1, 1, 2);
    pixel('#483f41', 1 - step, -2, 1, 2);
    pixel(coat, -1, -5, 3, 4);
    pixel('#f1c39a', -1, -7, 3, 2);
    pixel(town === 'seaside' ? '#eee5cd' : '#574b47', -1, -8, 3, 1);
    pixel('#574b47', direction > 0 ? -1 : 1, -7, 1, 1);
    const side = direction > 0 ? 2 : -4;
    if (kind === 'basket' || kind === 'porter') {
      pixel('#79513a', side, -4, 3, 3);
      pixel(kind === 'basket' ? '#d8ae6d' : '#d68c57', side, -4, 3, 2);
      pixel('#f3cb89', side + 1, -5, 1, 2);
    } else if (kind === 'lantern') {
      pixel('#89643f', side, -5, 2, 4);
      pixel('#ffe18b', side, -4, 2, 2);
    } else if (kind === 'cart') {
      const bed = direction > 0 ? 3 : -8;
      pixel('#58473a', direction > 0 ? 1 : -3, -3, 4, 1);
      pixel('#98663e', bed, -3, 6, 2);
      pixel('#ddb67e', bed + 1, -5, 4, 2);
      pixel('#45474a', bed + 1, -1, 2, 2);
      pixel('#45474a', bed + 4, -1, 1, 2);
    }
  }
  ctx.resetTransform();
}
