'use client';

/**
 * つなぎ先の決め方。
 *
 * 大会当日に「ビルドし直さないと直せない」状態を作らないため、
 * URL の ?api= で上書きでき、その内容をこの端末に覚えさせる。
 */

import { DEFAULT_EVENT_ID, normalizeEventId } from '../../core/eventId.ts';

// 既存UIZIN端末の接続先・操作キーを消さないため、旧キーをそのまま引き継ぐ。
const API_KEY_STORAGE = 'uizin.eventos.api';
const OPERATOR_KEY_STORAGE = 'uizin.eventos.operatorKey';
const EVENT_ID_STORAGE = 'tournament.os.eventId';

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

export function getEventId(): string {
  if (typeof window === 'undefined') return DEFAULT_EVENT_ID;
  const fromUrl = readSearchParam('event');
  if (fromUrl) {
    const eventId = normalizeEventId(fromUrl);
    setEventId(eventId);
    return eventId;
  }
  try {
    return normalizeEventId(window.localStorage.getItem(EVENT_ID_STORAGE));
  } catch {
    return DEFAULT_EVENT_ID;
  }
}

export function setEventId(value: string): void {
  try {
    window.localStorage.setItem(EVENT_ID_STORAGE, normalizeEventId(value));
  } catch {
    // 無視
  }
}

export function apiUrl(base: string, path: string): string {
  if (!base.trim()) return path + '?event=' + encodeURIComponent(getEventId());
  const url = new URL(base.replace(/\/+$/, '') + path);
  url.searchParams.set('event', getEventId());
  return url.toString();
}

export function wsUrl(base: string): string {
  const url = base.startsWith('http') ? base : 'https://' + base;
  const target = new URL(url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws');
  target.searchParams.set('event', getEventId());
  return target.toString();
}
