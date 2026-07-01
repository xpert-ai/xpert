import type { ElementRef, TemplateRef } from '@angular/core';

export type ZardHighlightPlacement =
  | 'center'
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

export type ZardHighlightTarget =
  | HTMLElement
  | ElementRef<HTMLElement>
  | (() => HTMLElement | ElementRef<HTMLElement> | null | undefined)
  | null
  | undefined;

export interface ZardHighlightGap {
  offset?: number | [number, number];
  radius?: number;
}

export type ZardHighlightType = 'default' | 'primary';

export interface ZardHighlightStep {
  target?: ZardHighlightTarget;
  title?: string | TemplateRef<void>;
  description?: string | TemplateRef<void>;
  placement?: ZardHighlightPlacement;
  mask?: boolean;
  gap?: ZardHighlightGap;
  type?: ZardHighlightType;
}

export interface ZardHighlightActionsContext {
  current: number;
  total: number;
  step: ZardHighlightStep | null;
  isFirst: boolean;
  isLast: boolean;
  prev: () => void;
  next: () => void;
  close: () => void;
  finish: () => void;
}

export interface ZardHighlightIndicatorContext {
  current: number;
  total: number;
  step: ZardHighlightStep | null;
}
