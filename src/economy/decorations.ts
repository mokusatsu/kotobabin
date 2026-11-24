import type { LandscapeId } from '@/contracts/types';

type Point = readonly [number, number];
export interface Decoration {
  id: string;
  name: string;
  location: string;
  basePrice: number;
  angle: number;
  spots: readonly [Point, Point, Point, Point, Point];
}

function item(id: string, name: string, location: string, basePrice: number, angle: number, spots: Decoration['spots']): Decoration {
  return { id, name, location, basePrice, angle, spots };
}

// Ground coordinates are relative to the centre of each terrain strip, in purchase order.
export const DECORATIONS: Record<LandscapeId, readonly Decoration[]> = {
  riverside: [
    item('flowerbed', '季節の花壇', '住宅地から公園へ続く小道', 15, 0.25, [[-50,-36],[-59,13],[-66,38],[-48,56],[-80,80]]),
    item('bench', '川辺のベンチ', '川を見渡せる遊歩道', 20, 1.2, [[-41,-45],[-37,-34],[0,27],[9,42],[13,70]]),
    item('lantern', '琥珀の街灯', '橋へ向かう通りの角', 30, 0, [[-45,-27],[18,-33],[51,-22],[7,52],[60,37]]),
    item('sign', '木の道しるべ', '配達路が分かれる辻', 18, -0.3, [[-53,-25],[-66,-30],[-31,49],[82,24],[50,-43]]),
    item('lilies', 'スイレンの花', '流れのゆるい水面', 18, 0, [[15,4],[-16,-45],[38,29],[-21,-80],[43,77]]),
    item('duckhouse', '水鳥の浮き小屋', '岸に近い穏やかな瀬', 38, 0.3, [[4,-12],[35,18],[-27,-59],[29,58],[-12,-87]]),
    item('fishtrap', '竹の漁かご', '舟が行き交う浅瀬', 24, 1.1, [[-4,-19],[27,3],[-29,-73],[40,39],[37,87]]),
    item('reeds', '穂のあるヨシ', '水際の砂州', 16, 0, [[-12,-53],[21,-3],[23,32],[44,58],[-26,-90]]),
    item('willow', '枝垂れ柳', '河岸の草地', 45, 0, [[-12,11],[-42,-63],[11,61],[9,-56],[62,83]]),
    item('mooring', '舟つなぎの杭', '渡し場の岸辺', 20, 0.2, [[-1,18],[49,18],[0,-39],[14,81],[-37,-86]]),
  ],
  highland: [
    item('flowerbed', '山野草の花壇', '草原の散歩道', 15, -0.3, [[-23,39],[-45,52],[-35,55],[22,44],[51,30]]),
    item('bench', '見晴らしベンチ', '谷を一望する道端', 20, 0.4, [[-5,-34],[10,-34],[60,-20],[-43,63],[36,63]]),
    item('lantern', '山道の街灯', '橋と広場を結ぶ道', 30, 0, [[-19,3],[-12,-4],[51,-2],[-11,14],[59,25]]),
    item('sign', '登山道の道標', '山道の分岐', 18, -0.35, [[-29,-26],[-76,-26],[-17,-42],[-41,6],[-48,79]]),
    item('cairn', '石積みのケルン', '尾根の登山道', 22, 0, [[-31,-55],[-10,-65],[31,-50],[46,-40],[94,-15]]),
    item('trough', '石の水飲み場', '沢沿いの休憩場所', 32, -0.3, [[-31,-9],[-22,-6],[-9,5],[10,16],[31,28]]),
    item('pine', '若い針葉樹', '林の切れ目', 35, 0, [[-102,-12],[-85,28],[-63,20],[46,-28],[103,15]]),
    item('pennant', '山小屋の旗', '展望広場の縁', 23, 0.1, [[19,-31],[48,-16],[57,-10],[20,11],[-2,16]]),
    item('logs', '薪の山', '林道の作業場', 18, 0.4, [[-106,-31],[-90,-7],[-50,8],[85,-13],[99,24]]),
    item('picnic', 'ピクニック卓', '牧草地の休憩所', 40, -0.25, [[-28,48],[-21,47],[-5,26],[-66,30],[-79,36]]),
  ],
  seaside: [
    item('flowerbed', '潮風の花壇', '丘から港へ下る花の道', 15, 0.4, [[-40,-11],[-63,-6],[2,-2],[15,1],[-50,44]]),
    item('bench', '波待ちベンチ', '海を眺める遊歩道', 20, -0.3, [[25,-4],[33,-17],[38,-24],[46,48],[91,55]]),
    item('lantern', '波止場の灯り', '桟橋と防波堤', 30, 0, [[40,56],[49,57],[55,48],[90,71],[90,62]]),
    item('sign', '港の案内板', '丘と広場の分かれ道', 18, 0.25, [[-42,-22],[4,-22],[-15,12],[-23,32],[-66,59]]),
    item('parasol', 'しましまパラソル', '波打ち際の砂浜', 38, 0, [[58,-57],[51,-26],[37,-8],[32,10],[35,36]]),
    item('lifering', '救命浮き輪', '水辺の手すり', 24, -0.3, [[40,75],[52,76],[57,84],[83,77],[87,74]]),
    item('deckchair', '浜辺のデッキチェア', '砂浜のくつろぎ処', 22, -0.6, [[60,-48],[47,-18],[36,1],[34,22],[40,40]]),
    item('buoy', '航路ブイ', '入り江の航路', 28, 0, [[82,26],[92,12],[102,0],[100,55],[76,80]]),
    item('creel', '港の魚かご', '水揚げ場の足元', 18, 0.4, [[38,65],[48,67],[58,74],[85,48],[91,51]]),
    item('bunting', '港祭りの旗飾り', '港町の石畳広場', 35, -0.22, [[-34,-2],[-25,0],[3,-12],[-24,9],[-16,3]]),
  ],
};

const levelPriceFactors = [1, 2, 100, 2_000, 30_000] as const;
export const decorationCost = (item: Decoration, currentLevel: number) => item.basePrice * levelPriceFactors[currentLevel];

export function placedDecorations(landscape: LandscapeId, levels: Readonly<Record<string, number>>) {
  return DECORATIONS[landscape].flatMap(item =>
    item.spots.slice(0, levels[item.id] ?? 0).map(([x, y]) => ({ item, x, y })));
}
