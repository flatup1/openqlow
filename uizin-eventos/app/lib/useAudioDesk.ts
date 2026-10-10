'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioSource, DEFAULT_VOLUMES, defaultPads, readPads, readVolumes } from '../../core/audio.ts';
import type { Pad, Volumes } from '../../core/audio.ts';
import { getApiBase } from './config.ts';

export type Track = { id: string; title: string; url: string; channel: 'red' | 'blue' | 'pads'; local?: boolean };
const STOP_CHANNEL = 'uizin.eventos.audio';

/** One media element per desk. A generation id prevents late play() promises reviving stopped audio. */
export function useAudioDesk() {
  const [playing, setPlaying] = useState<Track | null>(null);
  const [external, setExternal] = useState<Track | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);
  const [pads, setPads] = useState<Pad[]>(defaultPads);
  const [files, setFiles] = useState<Record<string, { url: string; name: string }>>({});
  const [loaded, setLoaded] = useState(false);
  const media = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const current = useRef<Track | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const ownedUrls = useRef(new Map<string, string>());

  const stopLocal = useCallback(() => {
    generation.current++;
    current.current = null;
    const audio = media.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    setPlaying(null); setPaused(false); setPosition(0); setDuration(0);
  }, []);
  const stop = useCallback(() => {
    stopLocal();
    channel.current?.postMessage('stop');
  }, [stopLocal]);

  useEffect(() => {
    const audio = new Audio();
    media.current = audio;
    audio.onended = stopLocal;
    audio.onerror = () => { if (current.current) { stopLocal(); setError('音源を読み込めませんでした。ファイル形式・URLを確認してください。'); } };
    audio.ontimeupdate = () => setPosition(audio.currentTime);
    audio.ondurationchange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    try {
      const bus = new BroadcastChannel(STOP_CHANNEL);
      bus.onmessage = () => stopLocal();
      channel.current = bus;
    } catch { /* Single-tab fallback. */ }
    try {
      const saved = JSON.parse(localStorage.getItem('uizin.eventos.desk:' + getApiBase()) ?? 'null');
      setVolumes(readVolumes(saved?.volumes)); setPads(readPads(saved?.pads));
      const opened = JSON.parse(sessionStorage.getItem('uizin.eventos.external:' + getApiBase()) ?? 'null');
      if (opened && typeof opened.title === 'string' && typeof opened.url === 'string' && audioSource(opened.url).kind === 'external') setExternal(opened);
    } catch { setError('設定を復元できませんでした。音量を確認してください。'); }
    setLoaded(true);
    return () => {
      generation.current++;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      channel.current?.close(); channel.current = null; media.current = null;
      for (const url of ownedUrls.current.values()) URL.revokeObjectURL(url);
      ownedUrls.current.clear();
    };
  }, [stopLocal]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem('uizin.eventos.desk:' + getApiBase(), JSON.stringify({ volumes, pads })); }
    catch { setError('この端末に設定を保存できません。再読込後は再設定してください。'); }
  }, [loaded, volumes, pads]);
  useEffect(() => {
    if (media.current) media.current.volume = volumes.master * volumes[current.current?.channel ?? 'pads'];
  }, [volumes, playing]);

  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem('uizin.eventos.external:' + getApiBase(), JSON.stringify(external)); } catch { /* Still show the external status for this page. */ }
  }, [loaded, external]);

  const play = useCallback(async (track: Track) => {
    if (external && !window.confirm('外部アプリで開いた曲があります。外部側で停止したことを確認してから切り替えてください。')) return;
    const source = track.local && ownedUrls.current.get(track.id) === track.url
      ? { kind: 'audio', url: track.url, label: 'OS内で再生' } : audioSource(track.url);
    if (source.kind === 'empty' || source.kind === 'invalid') { setError(source.label); return; }
    stop(); setError('');
    if (source.kind === 'external') {
      window.open(source.url, '_blank', 'noopener,noreferrer');
      setExternal(track);
      return;
    }
    setExternal(null);
    const audio = media.current;
    if (!audio) return;
    const token = generation.current;
    current.current = track;
    audio.src = source.url;
    audio.volume = volumes.master * volumes[track.channel];
    try {
      await audio.play();
      if (token !== generation.current) return;
      setPlaying(track); setPaused(false);
    } catch {
      if (token !== generation.current) return;
      stopLocal(); setError('音声を再生できませんでした。音源を確認して、再生ボタンをもう一度押してください。');
    }
  }, [external, stop, stopLocal, volumes]);

  const togglePause = async () => {
    const audio = media.current;
    if (!audio || !current.current) return;
    if (!audio.paused) { audio.pause(); setPaused(true); return; }
    const token = generation.current;
    try { await audio.play(); if (token === generation.current) setPaused(false); }
    catch { if (token === generation.current) { stopLocal(); setError('再開できませんでした。音源を確認してください。'); } }
  };
  const selectFile = (id: string, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(file.name)) { setError('音声ファイルを選んでください。'); return; }
    if (current.current?.id === id) stop();
    const old = ownedUrls.current.get(id);
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    ownedUrls.current.set(id, url);
    setFiles(previous => ({ ...previous, [id]: { url, name: file.name } }));
  };
  const clearFile = (id: string) => {
    if (current.current?.id === id) stop();
    const url = ownedUrls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    ownedUrls.current.delete(id);
    setFiles(previous => { const next = { ...previous }; delete next[id]; return next; });
  };
  return { playing, external, paused, position, duration, error, volumes, setVolumes, pads, setPads,
    files, selectFile, clearFile, play, stop, togglePause, clearExternal: () => setExternal(null) };
}
