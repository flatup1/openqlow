import type { EntryFieldMode } from './entryPackage.ts';

export type PublicEntryConfig = {
  endpoint: string;
  eventId: string;
  title: string;
  organizer: string;
  date: string;
  venue: string;
  venueUrl: string;
  deadline: string;
  contact: string;
  music: boolean;
  grade: EntryFieldMode;
  age: EntryFieldMode;
  comment: EntryFieldMode;
};

export const EMPTY_PUBLIC_ENTRY_CONFIG: PublicEntryConfig = {
  endpoint: '', eventId: 'my-tournament', title: '', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '',
  music: false, grade: 'optional', age: 'optional', comment: 'optional',
};

const APPS_SCRIPT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function isAppsScriptUrl(value: string): boolean {
  return APPS_SCRIPT.test(value.trim());
}

export function isVenueUrl(value: string): boolean {
  return /^https:\/\/(?:share\.google|maps\.app\.goo\.gl|www\.google\.com\/maps)(?:\/|$)/.test(value.trim());
}

export function publicEntryHash(config: PublicEntryConfig): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) params.set(key, typeof value === 'boolean' ? (value ? 'on' : 'off') : value);
  return '#' + params.toString();
}

export function publicEntryConfig(hash: string): PublicEntryConfig {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const mode = (key: string, fallback: EntryFieldMode): EntryFieldMode => {
    const value = params.get(key);
    return value === 'off' || value === 'optional' || value === 'required' ? value : fallback;
  };
  return {
    endpoint: params.get('endpoint')?.trim() ?? '',
    eventId: params.get('eventId')?.trim() || 'my-tournament',
    title: params.get('title')?.trim() ?? '', organizer: params.get('organizer')?.trim() ?? '',
    date: params.get('date')?.trim() ?? '', venue: params.get('venue')?.trim() ?? '', venueUrl: params.get('venueUrl')?.trim() ?? '',
    deadline: params.get('deadline')?.trim() ?? '', contact: params.get('contact')?.trim() ?? '',
    music: params.get('music') === 'on', grade: mode('grade', 'optional'), age: mode('age', 'optional'), comment: mode('comment', 'optional'),
  };
}
