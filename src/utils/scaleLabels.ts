import type { Scale } from '../db';
import type { TFunction } from 'i18next';

export function tScaleLabels(scale: Scale, t: TFunction) {
  const id = scale.id;
  const left = t(`scales.${id}.left`, { defaultValue: scale.left_label });
  const right = t(`scales.${id}.right`, { defaultValue: scale.right_label });
  return { left, right };
}

export function isRTL() {
  if (typeof document !== 'undefined') return document.documentElement.dir === 'rtl';
  return false;
}

