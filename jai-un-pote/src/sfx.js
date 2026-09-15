// sfx.js — Bruitages synthétisés (6 septembre 2026 : « des bruitages quand un
// pote arrive, en lien avec un bruit d'herbe, un peu moins fort que
// l'instrumental »). Zéro fichier : oscillateurs et bruit filtré sur le
// contexte du morceau, via audio.sfxOutput() (donc derrière le curseur de
// volume). Gains bas : présents, jamais devant la musique.

import * as audio from "./audio.js";

function out() { return audio.sfxOutput(); }

function noise(ctx, dur) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(ctx, dest, { type = "sine", f0, f1 = f0, t0, dur, gain, curve = "exp" }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  if (curve === "exp") g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  else g.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(g); g.connect(dest);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// Pièce : petit blip clair.
export function piece() {
  const o = out(); if (!o) return;
  tone(o.ctx, o.dest, { f0: 880, f1: 1320, t0: o.ctx.currentTime, dur: 0.09, gain: 0.05 });
}

// Pote qui arrive : souffle d'herbe (bruit filtré) + montée douce.
export function pote() {
  const o = out(); if (!o) return;
  const { ctx, dest } = o;
  const t0 = ctx.currentTime;
  const n = noise(ctx, 0.45);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.4); bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
  n.connect(bp); bp.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + 0.5);
  tone(ctx, dest, { f0: 440, f1: 880, t0: t0 + 0.05, dur: 0.3, gain: 0.05 });
}

// Pote perdu : choc mat.
export function potePerdu() {
  const o = out(); if (!o) return;
  tone(o.ctx, o.dest, { type: "square", f0: 180, f1: 80, t0: o.ctx.currentTime, dur: 0.22, gain: 0.07 });
}

// Saut : souffle court. Salto : souffle + montée.
export function saut() {
  const o = out(); if (!o) return;
  const { ctx, dest } = o;
  const t0 = ctx.currentTime;
  const n = noise(ctx, 0.12);
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
  n.connect(hp); hp.connect(g); g.connect(dest);
  n.start(t0); n.stop(t0 + 0.14);
}
export function salto() {
  saut();
  const o = out(); if (!o) return;
  tone(o.ctx, o.dest, { f0: 520, f1: 1240, t0: o.ctx.currentTime, dur: 0.28, gain: 0.05 });
}

// Klaxon du tracteur : deux notes tenues.
export function klaxon() {
  const o = out(); if (!o) return;
  const t0 = o.ctx.currentTime;
  tone(o.ctx, o.dest, { type: "square", f0: 330, t0, dur: 0.32, gain: 0.05, curve: "lin" });
  tone(o.ctx, o.dest, { type: "square", f0: 415, t0, dur: 0.32, gain: 0.05, curve: "lin" });
}

// Brique de lait : arpège rapide.
export function lait() {
  const o = out(); if (!o) return;
  const t0 = o.ctx.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => tone(o.ctx, o.dest, { f0: f, t0: t0 + i * 0.06, dur: 0.18, gain: 0.05 }));
}

// Pièce rouge : accord qui brille.
export function rouge() {
  const o = out(); if (!o) return;
  const t0 = o.ctx.currentTime;
  [659, 830, 1108, 1318].forEach((f, i) => tone(o.ctx, o.dest, { f0: f, t0: t0 + i * 0.05, dur: 0.5, gain: 0.05 }));
}

// Fin du morceau = fin de la course : accord long.
export function fin() {
  const o = out(); if (!o) return;
  const t0 = o.ctx.currentTime;
  [261, 329, 392, 523].forEach((f) => tone(o.ctx, o.dest, { f0: f, t0, dur: 1.2, gain: 0.04 }));
}
