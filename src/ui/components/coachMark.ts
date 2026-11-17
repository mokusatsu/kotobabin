import { el } from '../utils/dom';

export type CoachPointerDirection = 'down' | 'left' | 'up' | 'none';

export interface CoachMarkProps {
  stepBadge: string;
  title: string;
  body: string;
  bodyAccent?: boolean;
  subNote?: string | null;
  subNoteAccent?: boolean;
  actionHint?: string | null;
  pointerDirection?: CoachPointerDirection;
  compactHeader?: boolean;
  extraContent?: HTMLElement | null;
  primaryLabel?: string;
  primaryTestId?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryTestId?: string;
  onSecondary?: () => void;
  testId?: string;
  step?: string;
  className?: string;
}

export function renderCoachMark(props: CoachMarkProps): HTMLElement {
  const {
    stepBadge,
    title,
    body,
    bodyAccent = false,
    subNote,
    subNoteAccent = false,
    actionHint = null,
    pointerDirection = 'none',
    compactHeader = false,
    extraContent = null,
    primaryLabel,
    primaryTestId,
    onPrimary,
    secondaryLabel,
    secondaryTestId,
    onSecondary,
    testId = 'onboarding-coach',
    step,
    className = '',
  } = props;

  const skipBtn =
    secondaryLabel && onSecondary
      ? (() => {
          const btn = el(
            'button',
            {
              type: 'button',
              className: 'kb-btn-secondary kb-coach-skip-btn',
              'data-testid': secondaryTestId,
            },
            secondaryLabel,
          );
          btn.addEventListener('mousedown', (e) => e.preventDefault());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onSecondary();
          });
          return btn;
        })()
      : null;

  const primaryBtn =
    primaryLabel && onPrimary
      ? (() => {
          const btn = el(
            'button',
            {
              type: 'button',
              className: 'kb-btn-primary kb-coach-primary-btn',
              'data-testid': primaryTestId,
            },
            el('span', {}, primaryLabel),
            el('kbd', { className: 'kb-kbd' }, 'Enter'),
          );
          btn.addEventListener('mousedown', (e) => e.preventDefault());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onPrimary();
          });
          return btn;
        })()
      : null;

  const arrowEl =
    pointerDirection !== 'none'
      ? el('span', {
          className: `kb-coach-arrow is-arrow-${pointerDirection}`,
          'aria-hidden': 'true',
        })
      : null;

  const titleEl = el('h2', { className: 'kb-h3 kb-coach-title' }, title);

  const hasInlinePrimary = Boolean(primaryBtn && !actionHint && !subNote && !extraContent);

  return el(
    'section',
    {
      className: `kb-coach-mark${compactHeader ? ' is-compact-head' : ''}${className ? ` ${className}` : ''}`,
      role: 'region',
      'aria-live': 'polite',
      'aria-label': title,
      'data-testid': testId,
      'data-onboarding-step': step,
      'data-pointer': pointerDirection,
    },
    arrowEl,
    el(
      'div',
      { className: 'kb-card kb-coach-inner' },
      el(
        'div',
        { className: 'kb-coach-head' },
        compactHeader
          ? el(
              'div',
              { className: 'kb-coach-head-main' },
              el('span', { className: 'kb-badge kb-coach-step-badge' }, stepBadge),
              titleEl,
            )
          : el('span', { className: 'kb-badge kb-coach-step-badge' }, stepBadge),
        skipBtn,
      ),
      compactHeader ? null : titleEl,
      hasInlinePrimary
        ? el(
            'div',
            { className: 'kb-coach-body-row' },
            el('p', { className: `kb-coach-body${bodyAccent ? ' is-accent' : ''}` }, body),
            primaryBtn,
          )
        : el('p', { className: `kb-coach-body${bodyAccent ? ' is-accent' : ''}` }, body),
      actionHint
        ? el(
            'div',
            {
              className: 'kb-coach-action-hint',
              'data-testid': 'onboarding-action-hint',
            },
            actionHint,
          )
        : null,
      subNote
        ? el(
            'p',
            {
              className: `kb-coach-subnote kb-small${subNoteAccent ? ' is-accent' : ''}`,
              'data-testid': 'onboarding-subnote',
            },
            subNote,
          )
        : null,
      extraContent,
      !hasInlinePrimary && primaryBtn ? el('div', { className: 'kb-coach-actions' }, primaryBtn) : null,
    ),
  );
}
