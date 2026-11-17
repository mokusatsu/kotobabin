import type { LandscapeId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import type { UIControllerActions } from '../types';
import { assetImg, el } from '../utils/dom';
import { formatMaterials, LANDSCAPE_LABELS } from '../utils/format';

export interface NewCityScreenProps {
  economy: CityEconomy;
  selectedLandscape: LandscapeId;
  onSelectLandscape: (landscape: LandscapeId) => void;
  actions: UIControllerActions;
}

const LANDSCAPES: readonly LandscapeId[] = ['riverside', 'seaside', 'highland'];

export function renderNewCityScreen(props: NewCityScreenProps): HTMLElement {
  const { economy, selectedLandscape, onSelectLandscape, actions } = props;
  const preview = economy.newCityPreview();

  const backBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, '← 戻る'),
  );
  backBtn.addEventListener('click', () => actions.navigate('HOME'));

  const landscapeCards = el(
    'div',
    { className: 'kb-row-wrap', role: 'radiogroup', 'aria-label': '新しい街の地形' },
    ...LANDSCAPES.map((ls) => {
      const selected = selectedLandscape === ls;
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-landscape-btn${selected ? ' is-selected' : ''}`,
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
        },
        assetImg(`./assets/raster/terrain_${ls}.jpg`, LANDSCAPE_LABELS[ls], {
          className: 'kb-landscape-thumb',
          fallbackSrc: './assets/raster/terrain_riverside.jpg',
        }),
        el('strong', {}, LANDSCAPE_LABELS[ls]),
      );
      btn.addEventListener('click', () => onSelectLandscape(ls));
      return btn;
    }),
  );

  const confirmBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-primary',
      disabled: !preview.eligible,
    },
    el('span', {}, preview.eligible ? `青写真 +${preview.reward_blueprints}枚 を受け取って新しい街へ` : 'まだ出発条件を満たしていません'),
  );
  confirmBtn.addEventListener('click', () => actions.confirmNewCity(selectedLandscape));

  return el(
    'div',
    { className: 'kb-stack-md' },
    backBtn,
    el(
      'section',
      { className: 'kb-card kb-stack-md' },
      el('h2', { className: 'kb-h2' }, '新しい街へ出発'),
      el(
        'dl',
        { className: 'kb-stat-list' },
        el('dt', {}, '全6地区 Lv.3以上'),
        el('dd', {}, preview.stage_requirement_met ? '達成' : '未達成'),
        el('dt', {}, '街の累計到着資材'),
        el('dd', {}, `${formatMaterials(preview.arrived_micro)} / 100,000 以上`),
        el('dt', {}, '獲得予定の青写真'),
        el('dd', {}, `+${preview.reward_blueprints}枚（次の増額まであと ${formatMaterials(preview.remaining_to_next_reward_micro)} 資材）`),
      ),
      el(
        'div',
        { className: 'kb-grid-2' },
        el(
          'div',
          { className: 'kb-stamp-card kb-stack-xs' },
          el('strong', {}, 'リセットされるもの'),
          el('ul', {}, el('li', {}, '所持コイン・荷づくり台'), el('li', {}, '6地区のLv・店舗・配送班・鉄道・資材'), el('li', {}, '連携')),
        ),
        el(
          'div',
          { className: 'kb-stamp-card kb-stack-xs' },
          el('strong', {}, '引き継がれるもの'),
          el('ul', {}, el('li', {}, '青写真と研究ランク'), el('li', {}, '切手・実績・ことば図鑑'), el('li', {}, '記録・設定・生涯統計')),
        ),
      ),
      el('h3', { className: 'kb-h3' }, '地形を選ぶ'),
      landscapeCards,
      confirmBtn,
    ),
  );
}
