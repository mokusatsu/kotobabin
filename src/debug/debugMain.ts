import '../ui/styles/tokens.css';
import '../ui/styles/main.css';
import { CITY_CATALOG } from '@/contracts/data';
import type { DistrictId } from '@/contracts/types';
import { CityEconomy, type CityEconomySnapshot } from '@/economy/cityEconomy';
import {
  createProfileRepository,
  PROFILE_DB_NAME,
  type ProfileRepository,
} from '@/progression/profileRepository';
import { renderCityMap } from '@/ui/components/cityMap';
import { assetImg, el } from '@/ui/utils/dom';
import {
  buildCityAchievementSnapshot,
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  getDestinationRasterSprite,
  getDioramaBuildingSprite,
  getDistrictBuildingSprite,
} from '@/ui/utils/format';

type LandscapeId = 'riverside' | 'highland' | 'seaside';

interface VisualTarget {
  key: DistrictId | 'central_hub' | 'packaging';
  label: string;
  scenicSrc?: string;
}

const VISUAL_TARGETS: VisualTarget[] = [
  ...DISTRICT_ORDER.map((id) => ({
    key: id,
    label: DISTRICT_NAME_MAP[id],
    scenicSrc: getDestinationRasterSprite(id, 1),
  })),
  { key: 'central_hub', label: '中央ハブ', scenicSrc: './assets/raster/scenic_hub.jpg' },
  { key: 'packaging', label: '梱包所' },
];

const LANDSCAPE_LABELS: Record<LandscapeId, string> = {
  riverside: '川辺の街 (riverside)',
  highland: '高原の街 (highland)',
  seaside: '海辺の街 (seaside)',
};

class DebugPageController {
  private mountEl: HTMLElement;
  private repo: ProfileRepository | null = null;
  private economy: CityEconomy = new CityEconomy(Date.now());
  private selectedDistrictId: DistrictId = 'residential';
  private selectedLevel = 1;
  private compareTarget: DistrictId | 'central_hub' | 'packaging' = 'residential';
  private statusMessage = '現在のセーブデータ状態を読み込みました。';
  private statusTone: 'info' | 'success' | 'danger' = 'info';
  private shellMounted = false;
  private headerHost = el('div');
  private statusHost = el('div');
  private stateSectionHost = el('div');
  private visualSectionHost = el('div');

  constructor(mountEl: HTMLElement) {
    this.mountEl = mountEl;
  }

  async init(): Promise<void> {
    await this.loadFromStorage();
    this.render();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const { repository } = await createProfileRepository({ tabId: `debug-${Date.now()}` });
      const snap = await repository.loadAll();
      this.repo = repository;
      if (snap.city?.state) {
        this.economy = CityEconomy.fromSnapshot(
          snap.city.state as unknown as CityEconomySnapshot,
        );
        this.statusMessage = '保存済みの街データ（IndexedDB）を読み込みました。';
        this.statusTone = 'info';
      } else {
        this.economy = new CityEconomy(Date.now());
        this.statusMessage = '保存データがないため初期状態の街を表示しています。';
        this.statusTone = 'info';
      }
    } catch (err) {
      this.economy = new CityEconomy(Date.now());
      this.statusMessage = `読み込み時に初期状態へフォールバックしました: ${String(err)}`;
      this.statusTone = 'danger';
    }
  }

  private mutateSnapshot(mutator: (snap: CityEconomySnapshot) => void): void {
    const snap = this.economy.snapshot();
    mutator(snap);
    this.economy = CityEconomy.fromSnapshot(snap);
    this.renderHeaderAndState();
  }

  private applyBulkLevel(level: number): void {
    const clamped = Math.max(0, Math.min(5, level));
    this.statusMessage = `全ステージ・施設を Lv.${clamped} に切り替えました（未保存・プレビュー中）。`;
    this.statusTone = 'info';
    this.mutateSnapshot((snap) => {
      snap.packaging_level = clamped;
      for (const dId of DISTRICT_ORDER) {
        const d = snap.districts[dId];
        d.open = clamped > 0 || dId === 'residential';
        d.stage = clamped;
        d.shops = clamped > 0 ? Math.max(d.shops, clamped) : 0;
        d.crews = clamped > 0 ? Math.max(d.crews, clamped) : 0;
        if (clamped === 0) {
          d.railway = false;
        }
      }
    });
  }

  private async saveToMainGame(): Promise<void> {
    try {
      const tabId = `debug-${Date.now()}`;
      if (!this.repo) {
        const created = await createProfileRepository({ tabId });
        this.repo = created.repository;
      }
      const meta = await this.repo.acquireTabLock(tabId);
      const snap = this.economy.snapshot();
      await this.repo.commitCityEconomy({
        lock: {
          tabId,
          writeEpoch: meta.writeEpoch,
          resetGeneration: meta.resetGeneration,
        },
        cityId: snap.city_id,
        economyEventId: `debug-apply-${Date.now()}`,
        cityRecord: {
          id: 'current',
          cityId: snap.city_id,
          revision: snap.city_sequence,
          updatedAt: Date.now(),
          state: snap as unknown as Record<string, unknown>,
        },
        cityAchievementSnapshot: buildCityAchievementSnapshot(this.economy, 0),
      });
      this.statusMessage = '現在の発展状態を本編のセーブデータへ保存しました。「本編を開く」で確認できます。';
      this.statusTone = 'success';
    } catch (err) {
      this.statusMessage = `セーブデータへの保存に失敗しました: ${String(err)}`;
      this.statusTone = 'danger';
    }
    this.render();
  }

  private async deleteAllData(): Promise<void> {
    try {
      if (this.repo) {
        this.repo.close();
        this.repo = null;
      }
      await new Promise<void>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          resolve();
          return;
        }
        const req = indexedDB.deleteDatabase(PROFILE_DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
        req.onblocked = () => resolve();
      });
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Ignore storage restrictions
      }
      this.economy = new CityEconomy(Date.now());
      this.statusMessage = '全データ（IndexedDB / localStorage / sessionStorage）を削除しました。';
      this.statusTone = 'danger';
    } catch (err) {
      this.statusMessage = `全データ削除に失敗しました: ${String(err)}`;
      this.statusTone = 'danger';
    }
    this.render();
  }

  private ensureShell(): void {
    if (this.shellMounted) {
      return;
    }
    this.shellMounted = true;
    this.mountEl.replaceChildren(
      el(
        'div',
        { className: 'kb-debug-shell' },
        this.headerHost,
        this.statusHost,
        this.stateSectionHost,
        this.visualSectionHost,
      ),
    );
  }

  private render(): void {
    this.ensureShell();
    this.renderHeaderAndState();
    this.renderVisualSection();
  }

  private renderHeaderAndState(): void {
    this.ensureShell();
    const snap = this.economy.snapshot();

    const header = el(
      'header',
      { className: 'kb-debug-header' },
      el(
        'div',
        { className: 'kb-debug-title-group' },
        el('h1', { className: 'kb-debug-title' }, 'ことば便 デバッグビューア'),
        el(
          'span',
          { className: 'kb-badge kb-small' },
          `地形: ${snap.landscape} / 所持金: ${Math.floor(Number(BigInt(snap.coins_micro) / 1_000_000n)).toLocaleString('ja-JP')}`,
        ),
      ),
      el(
        'div',
        { className: 'kb-debug-header-actions' },
        el('a', { className: 'kb-btn-secondary', href: '../' }, '本編を開く (../)'),
        (() => {
          const saveBtn = el(
            'button',
            { type: 'button', className: 'kb-btn-primary' },
            '本編データへ保存',
          );
          saveBtn.addEventListener('click', () => {
            void this.saveToMainGame();
          });
          return saveBtn;
        })(),
        (() => {
          const wipeBtn = el(
            'button',
            { type: 'button', className: 'kb-btn-danger', 'data-debug-wipe': 'true' },
            '全データ削除',
          );
          wipeBtn.addEventListener('click', () => {
            void this.deleteAllData();
          });
          return wipeBtn;
        })(),
      ),
    );

    const statusBar = el(
      'div',
      { className: `kb-debug-status is-${this.statusTone}`, 'data-debug-status': 'true' },
      this.statusMessage,
    );

    // Section 1: Stage & Development State Switcher + Live CityMap
    const landscapeButtons = (Object.keys(LANDSCAPE_LABELS) as LandscapeId[]).map((lId) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: snap.landscape === lId ? 'kb-btn-primary' : 'kb-btn-secondary',
          'data-debug-landscape': lId,
        },
        LANDSCAPE_LABELS[lId],
      );
      btn.addEventListener('click', () => {
        this.mutateSnapshot((s) => {
          s.landscape = lId;
        });
        this.statusMessage = `地形を ${LANDSCAPE_LABELS[lId]} に切り替えました（未保存・プレビュー中）。`;
        this.statusTone = 'info';
      });
      return btn;
    });

    const bulkButtons = [0, 1, 2, 3, 4, 5].map((lv) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: 'kb-btn-secondary',
          'data-debug-bulk-lv': String(lv),
        },
        `全Lv.${lv}`,
      );
      btn.addEventListener('click', () => this.applyBulkLevel(lv));
      return btn;
    });

    const coinsPlusBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-secondary' },
      '資金 +100,000',
    );
    coinsPlusBtn.addEventListener('click', () => {
      this.mutateSnapshot((s) => {
        s.coins_micro = (BigInt(s.coins_micro) + 100_000n * 1_000_000n).toString();
      });
    });

    const districtControlsGrid = el('div', { className: 'kb-debug-controls-grid' });

    // Packaging level control
    const pkgSelect = el(
      'select',
      { className: 'kb-debug-select', 'aria-label': '梱包所 Lv' },
      ...[0, 1, 2, 3, 4, 5].map((lv) => {
        const opt = el('option', { value: String(lv) }, `Lv.${lv}`);
        if (snap.packaging_level === lv) {
          opt.selected = true;
        }
        return opt;
      }),
    );
    pkgSelect.addEventListener('change', () => {
      const lv = Number(pkgSelect.value);
      this.mutateSnapshot((s) => {
        s.packaging_level = lv;
      });
    });

    districtControlsGrid.appendChild(
      el(
        'div',
        { className: 'kb-debug-control-card' },
        el('div', { className: 'kb-debug-control-head' }, el('strong', {}, '梱包所 (hub)')),
        el('label', { className: 'kb-debug-field' }, '設備Lv ', pkgSelect),
      ),
    );

    for (const dId of DISTRICT_ORDER) {
      const d = snap.districts[dId];
      const dCfg = CITY_CATALOG.districts.find((c) => c.id === dId);
      const openCb = el('input', { type: 'checkbox' });
      openCb.checked = d.open;
      openCb.addEventListener('change', () => {
        this.mutateSnapshot((s) => {
          s.districts[dId].open = openCb.checked;
        });
      });

      const stageSelect = el(
        'select',
        { className: 'kb-debug-select', 'data-debug-district-stage': dId },
        ...[0, 1, 2, 3, 4, 5].map((lv) => {
          const opt = el('option', { value: String(lv) }, `Lv.${lv}`);
          if (d.stage === lv) {
            opt.selected = true;
          }
          return opt;
        }),
      );
      stageSelect.addEventListener('change', () => {
        const lv = Number(stageSelect.value);
        this.mutateSnapshot((s) => {
          s.districts[dId].stage = lv;
          if (lv > 0) {
            s.districts[dId].open = true;
          }
        });
      });

      const railCb = el('input', { type: 'checkbox' });
      railCb.checked = d.railway;
      railCb.addEventListener('change', () => {
        this.mutateSnapshot((s) => {
          s.districts[dId].railway = railCb.checked;
        });
      });

      districtControlsGrid.appendChild(
        el(
          'div',
          { className: 'kb-debug-control-card' },
          el(
            'div',
            { className: 'kb-debug-control-head' },
            el('strong', {}, dCfg?.name ?? DISTRICT_NAME_MAP[dId]),
            el('label', { className: 'kb-debug-check' }, openCb, '開通'),
          ),
          el(
            'div',
            { className: 'kb-debug-control-row' },
            el('label', { className: 'kb-debug-field' }, '段階 ', stageSelect),
            el('label', { className: 'kb-debug-check' }, railCb, '鉄道'),
          ),
        ),
      );
    }

    const cityMapEl = renderCityMap({
      economy: this.economy,
      selectedDistrictId: this.selectedDistrictId,
      reducedMotion: false,
      onSelectDistrict: (dId: DistrictId) => {
        this.selectedDistrictId = dId;
        this.compareTarget = dId;
        this.render();
      },
    });

    const stateSection = el(
      'section',
      { className: 'kb-card kb-debug-section' },
      el('h2', { className: 'kb-debug-h2' }, '1. 任意のステージ・発展状態の切り替え & マッププレビュー'),
      el(
        'div',
        { className: 'kb-debug-toolbar' },
        el('div', { className: 'kb-debug-btn-group' }, ...landscapeButtons),
        el('div', { className: 'kb-debug-btn-group' }, ...bulkButtons, coinsPlusBtn),
      ),
      districtControlsGrid,
      el('div', { className: 'kb-debug-map-wrap' }, cityMapEl),
    );

    this.headerHost.replaceChildren(header);
    this.statusHost.replaceChildren(statusBar);
    this.stateSectionHost.replaceChildren(stateSection);
  }

  private renderVisualSection(): void {
    this.ensureShell();
    // Section 2: Lv 1-5 Visual Gallery
    const lvButtons = [1, 2, 3, 4, 5].map((lv) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: this.selectedLevel === lv ? 'kb-btn-primary' : 'kb-btn-secondary',
          'data-debug-lv-btn': String(lv),
        },
        `Lv.${lv} を表示`,
      );
      btn.addEventListener('click', () => {
        this.selectedLevel = lv;
        this.renderVisualSection();
      });
      return btn;
    });

    const galleryGrid = el('div', { className: 'kb-debug-gallery-grid' });
    for (const target of VISUAL_TARGETS) {
      const dioramaSrc = getDioramaBuildingSprite(target.key, this.selectedLevel);
      const buildingSrc =
        target.key === 'central_hub' || target.key === 'packaging'
          ? `./assets/sprites/buildings/${target.key}_stage${this.selectedLevel}.png`
          : getDistrictBuildingSprite(target.key, this.selectedLevel);

      const card = el(
        'article',
        {
          className: `kb-debug-visual-card${this.compareTarget === target.key ? ' is-active' : ''}`,
          'data-debug-card': target.key,
        },
        el(
          'div',
          { className: 'kb-debug-card-head' },
          el('strong', {}, `${target.label} (Lv.${this.selectedLevel})`),
          (() => {
            const cmpBtn = el(
              'button',
              { type: 'button', className: 'kb-btn-secondary kb-debug-mini-btn' },
              'Lv1-5比較',
            );
            cmpBtn.addEventListener('click', () => {
              this.compareTarget = target.key;
              this.renderVisualSection();
            });
            return cmpBtn;
          })(),
        ),
        el(
          'div',
          { className: 'kb-debug-card-imgs' },
          el(
            'figure',
            { className: 'kb-debug-fig' },
            assetImg(dioramaSrc, `${target.label} diorama Lv.${this.selectedLevel}`, {
              className: 'kb-debug-thumb',
            }),
            el('figcaption', {}, 'diorama'),
          ),
          el(
            'figure',
            { className: 'kb-debug-fig' },
            assetImg(buildingSrc, `${target.label} buildings Lv.${this.selectedLevel}`, {
              className: 'kb-debug-thumb',
            }),
            el('figcaption', {}, 'buildings'),
          ),
          target.scenicSrc
            ? el(
                'figure',
                { className: 'kb-debug-fig' },
                assetImg(target.scenicSrc, `${target.label} scenic`, {
                  className: 'kb-debug-thumb is-scenic',
                }),
                el('figcaption', {}, '宛先背景'),
              )
            : null,
        ),
      );
      galleryGrid.appendChild(card);
    }

    // Side-by-side Lv 1..5 strip for the chosen compareTarget
    const compareTargetMeta =
      VISUAL_TARGETS.find((t) => t.key === this.compareTarget) ?? VISUAL_TARGETS[0];
    const compareStrip = el('div', { className: 'kb-debug-compare-strip' });
    for (const lv of [1, 2, 3, 4, 5]) {
      const dioramaSrc = getDioramaBuildingSprite(compareTargetMeta.key, lv);
      compareStrip.appendChild(
        el(
          'figure',
          { className: 'kb-debug-compare-item', 'data-debug-compare-lv': String(lv) },
          assetImg(dioramaSrc, `${compareTargetMeta.label} Lv.${lv}`, {
            className: 'kb-debug-compare-img',
          }),
          el('figcaption', {}, `${compareTargetMeta.label} Lv.${lv}`),
        ),
      );
    }

    const visualSection = el(
      'section',
      { className: 'kb-card kb-debug-section' },
      el('h2', { className: 'kb-debug-h2' }, '2. 各ステージの Lv.1〜5 ビジュアル確認'),
      el('div', { className: 'kb-debug-btn-group' }, ...lvButtons),
      galleryGrid,
      el(
        'div',
        { className: 'kb-debug-compare-box' },
        el(
          'h3',
          { className: 'kb-debug-h3' },
          `選択対象の Lv.1〜5 比較: ${compareTargetMeta.label}`,
        ),
        compareStrip,
      ),
    );

    this.visualSectionHost.replaceChildren(visualSection);
  }
}

const root = document.getElementById('debug-app');
if (root) {
  const controller = new DebugPageController(root);
  void controller.init();
}
