import { assetImg, el } from '../utils/dom';

interface StampArtOptions {
  stampAssetId: string;
  unlocked: boolean;
  hidden?: boolean;
  tierLabel?: string;
  frameAsset?: string;
}

export function renderStampArt({ stampAssetId, unlocked, hidden, tierLabel, frameAsset }: StampArtOptions): DocumentFragment {
  const art = hidden
    ? assetImg('./assets/ui_icon/ui_question.svg', '', {
      decorative: true, className: 'kb-stamp-inner-emblem',
    })
    : assetImg(`./assets/achievement_stamp/${stampAssetId}.webp`, '', {
      decorative: true, className: `kb-stamp-inner-art${unlocked ? ' is-earned' : ''}`,
    });
  const placeholder = !hidden && tierLabel
    ? el('span', { className: 'kb-series-stamp-placeholder', 'aria-hidden': 'true' }, tierLabel)
    : null;
  if (placeholder) {
    placeholder.hidden = true;
    art.addEventListener('error', () => {
      art.hidden = true;
      placeholder.hidden = false;
    });
  }
  const content = document.createDocumentFragment();
  content.append(art);
  if (placeholder) content.append(placeholder);
  if (!frameAsset) {
    content.append(assetImg('./assets/shared_frame/stamp_frame.svg', '', {
      decorative: true, className: 'kb-stamp-frame-overlay',
    }));
  }
  return content;
}

export function renderStampDialogBody(options: StampArtOptions & { info: HTMLElement }): HTMLElement {
  const preview = el('div', {
    className: `kb-stamp-dialog-preview${options.unlocked ? ' is-earned' : ''}`,
  }, renderStampArt(options));
  const { frameAsset } = options;
  let art = preview;
  if (frameAsset) {
    const frameId = frameAsset.slice(frameAsset.lastIndexOf('/') + 1, frameAsset.lastIndexOf('.'));
    art = el('div', { className: 'kb-equipped-stamp-frame', 'data-stamp-frame': frameId },
      preview,
      assetImg(frameAsset, '', {
        decorative: true, className: 'kb-equipped-stamp-frame-overlay',
      }),
    );
  }
  return el('div', { className: 'kb-stamp-dialog-body' },
    el('div', { className: 'kb-stamp-dialog-art-col' }, art),
    options.info,
  );
}
