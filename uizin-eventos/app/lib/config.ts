'use client';

/**
 * つなぎ先の決め方。
 *
 * 大会当日に「ビルドし直さないと直せない」状態を作らないため、
 * URL の ?api= で上書きでき、その内容をこの端末に覚えさせる。
 */

const API_KEY_STORAGE = 'uizin.eventos.api';
const OPERATOR_KEY_STORAGE = 'uizin.eventos.operatorKey';

const BUILD_TIME_API = process.env.NEXT_PUBLIC_EVENTOS_API ?? '';

function readSearchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

export function getApiBase(): string {
  if (typeof window === 'undefined') return BUILD_TIME_API;
  const fromUrl = readSearchParam('api').trim();
  if (fromUrl) {
    try {
      window.localStorage.setItem(API_KEY_STORAGE, fromUrl);
    } catch {
      // プライベートモードなどで保存できなくても動かす
    }
    return fromUrl.replace(/\/+$/, '');
  }
  try {
    const saved = window.localStorage.getItem(API_KEY_STORAGE);
    if (saved) return saved.replace(/\/+$/, '');
  } catch {
    // 無視
  }
  if (BUILD_TIME_API) return BUILD_TIME_API.replace(/\/+$/, '');
  return window.location.origin;
}

export function setApiBase(value: string): void {
  try {
    window.localStorage.setItem(API_KEY_STORAGE, value.replace(/\/+$/, ''));
  } catch {
    // 無視
  }
}

export function getOperatorKey(): string {
  if (typeof window === 'undefined') return '';
  const fromUrl = readSearchParam('key').trim();
  if (fromUrl) {
    setOperatorKey(fromUrl);
    return fromUrl;
  }
  try {
    return window.localStorage.getItem(OPERATOR_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setOperatorKey(value: string): void {
  try {
    window.localStorage.setItem(OPERATOR_KEY_STORAGE, value.trim());
  } catch {
    // 無視
  }
}

export function wsUrl(base: string): string {
  const url = base.startsWith('http') ? base : 'https://' + base;
  return url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
}
