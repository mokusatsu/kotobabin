import { ECONOMY_CONFIG } from '@/contracts/data';
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
  const { minimum_stage_each_district } = ECONOMY_CONFIG.new_city;

  const backBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', { 'aria-hidden': 'true' }, '←'),
    el('span', {}, '戻る'),
  );
  backBtn.addEventListener('click', () => actions.navigate('HOME'));

  const landscapeCards = el(
    'div',
    { className: 'kb-new-city-landscapes', role: 'radiogroup', 'aria-labelledby': 'kb-new-city-landscape-title' },
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
        assetImg(`./assets/raster/terrain_${ls}.jpg`, '', {
          className: 'kb-landscape-thumb',
          decorative: true,
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
      'data-testid': 'new-city-depart',
      disabled: !preview.eligible,
    },
    preview.eligible ? '新しい街へ出発する' : 'まだ出発条件を満たしていません',
  );
  confirmBtn.addEventListener('click', () => actions.confirmNewCity(selectedLandscape));

  return el(
    'div',
    { className: 'kb-new-city-screen kb-stack-md' },
    el('div', { className: 'kb-row-wrap kb-new-city-header' }, backBtn, el('h2', { className: 'kb-h2' }, '新しい街へ出発')),
    el(
      'section',
      { className: 'kb-card kb-stack-md', 'aria-label': '出発の確認' },
      el(
        'dl',
        { className: 'kb-new-city-conditions', 'aria-label': '出発条件' },
        el(
          'div',
          {},
          el('dt', {}, `全${Object.keys(economy.districts).length}地区がLv.${minimum_stage_each_district}以上`),
          el('dd', {}, preview.stage_requirement_met ? '達成' : '未達成'),
        ),
        el(
          'div',
          {},
          el('dt', {}, 'この街に届いた資材'),
          el('dd', {}, `${formatMaterials(preview.arrived_micro)} / ${formatMaterials(preview.required_arrived_micro)} 資材`),
        ),
      ),
      el('div', { className: 'kb-stack-xs' }, el('h3', { className: 'kb-h3', id: 'kb-new-city-landscape-title' }, '地形を選ぶ'), landscapeCards),
      el(
        'div',
        { className: 'kb-row-between kb-new-city-actions' },
        preview.eligible ? el(
          'div',
          {},
          el('strong', {}, `出発の報酬　設計図 ${preview.reward_blueprints}枚`),
          el('div', { className: 'kb-small kb-secondary' }, '街の設備の「研究」で使えます。'),
        ) : null,
        confirmBtn,
      ),
    ),
  );
}
