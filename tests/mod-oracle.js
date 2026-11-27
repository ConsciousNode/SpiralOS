// ============================================================================
// SpiralOS 1.7 — Independent ProTracker 4-Channel MOD Builder & Oracle Renderer
// (tests/mod-oracle.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Written directly from the ProTracker 2.3D / Amiga NoiseTracker MOD format
// documentation without reading os/apps/app_tracker.sp.
// ============================================================================

"use strict";

const { ReferenceMixer } = require("./audio-oracle.js");

const PT_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113
];

const PT_SINE = [
    0,  24,  49,  74,  97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120,  97,  74,  49,  24
];

const PAL_CLOCK = 3546895;
const OUT_RATE  = 22050;
const CH_PAN    = [64, 192, 192, 64];

function nearestPeriodIndex(period) {
  let best = 0, bestDist = 99999;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function periodToStepFP(period) {
  const p = Math.max(113, Math.min(856, period | 0));
  const hz = Math.trunc(PAL_CLOCK / p);
  return Math.trunc((hz << 16) / OUT_RATE);
}

/**
 * Procedurally build a valid 4-channel ProTracker .MOD binary (M.K.).
 */
function buildProceduralMod({ title = "SPIRAL TEST", orders = [0], patterns = [], samples = [] }) {
  const numPats = patterns.length;
  let totalSampleBytes = 0;
  const normSamples = [];
  for (let i = 0; i < 31; i++) {
    const s = samples[i] || { name: "", data: new Uint8Array(0), volume: 64, loopStart: 0, loopLen: 0 };
    const lenEven = s.data.length & ~1;
    const data = s.data.subarray(0, lenEven);
    normSamples.push({
      name: s.name || "",
      data,
      volume: Math.max(0, Math.min(64, s.volume === undefined ? 64 : s.volume)),
      loopStart: (s.loopStart || 0) & ~1,
      loopLen: (s.loopLen || 0) & ~1
    });
    totalSampleBytes += lenEven;
  }

  const totalLen = 1084 + numPats * 1024 + totalSampleBytes;
  const out = new Uint8Array(totalLen);
  for (let i = 0; i < Math.min(20, title.length); i++) out[i] = title.charCodeAt(i);

  for (let i = 0; i < 31; i++) {
    const h = 20 + i * 30;
    const s = normSamples[i];
    for (let k = 0; k < Math.min(22, s.name.length); k++) out[h + k] = s.name.charCodeAt(k);
    const words = s.data.length >>> 1;
    out[h + 22] = (words >>> 8) & 0xFF; out[h + 23] = words & 0xFF;
    out[h + 24] = 0; // finetune
    out[h + 25] = s.volume;
    const lsW = s.loopStart >>> 1;
    const llW = s.loopLen > 2 ? (s.loopLen >>> 1) : 1;
    out[h + 26] = (lsW >>> 8) & 0xFF; out[h + 27] = lsW & 0xFF;
    out[h + 28] = (llW >>> 8) & 0xFF; out[h + 29] = llW & 0xFF;
  }

  out[950] = orders.length;
  out[951] = 127;
  for (let i = 0; i < orders.length; i++) out[952 + i] = orders[i] & 0xFF;
  out[1080] = 0x4D; out[1081] = 0x2E; out[1082] = 0x4B; out[1083] = 0x2E; // "M.K."

  for (let p = 0; p < numPats; p++) {
    const pBase = 1084 + p * 1024;
    const rows = patterns[p] || [];
    for (let r = 0; r < Math.min(64, rows.length); r++) {
      const cols = rows[r] || [];
      for (let c = 0; c < Math.min(4, cols.length); c++) {
        const cell = cols[c];
        if (!cell) continue;
        const smp = cell.smp || 0;
        const per = cell.per || 0;
        const eff = cell.eff || 0;
        const prm = cell.prm || 0;
        const off = pBase + r * 16 + c * 4;
        out[off + 0] = (smp & 0xF0) | ((per >>> 8) & 0x0F);
        out[off + 1] = per & 0xFF;
        out[off + 2] = ((smp & 0x0F) << 4) | (eff & 0x0F);
        out[off + 3] = prm & 0xFF;
      }
    }
  }

  let sPos = 1084 + numPats * 1024;
  for (const s of normSamples) {
    out.set(s.data, sPos);
    sPos += s.data.length;
  }
  return out;
}

/**
 * Independent reference ProTracker renderer: renders exact interleaved stereo Int16 PCM
 * for a given number of ticks (or until song end).
 */
function renderModReference(modBytes, maxTicks = 512) {
  const magic = String.fromCharCode(modBytes[1080], modBytes[1081], modBytes[1082], modBytes[1083]);
  if (!["M.K.", "4CHN", "M!K!", "FLT4"].includes(magic)) throw new Error("Bad MOD magic: " + magic);
  const songLen = Math.max(1, Math.min(128, modBytes[950]));
  const orders = modBytes.subarray(952, 952 + 128);
  let maxPat = 0;
  for (let i = 0; i < 128; i++) if (orders[i] > maxPat) maxPat = orders[i];
  const numPats = maxPat + 1;

  const samples = [null];
  let sOff = 1084 + numPats * 1024;
  for (let i = 1; i <= 31; i++) {
    const h = 20 + (i - 1) * 30;
    const len = ((modBytes[h + 22] << 8) | modBytes[h + 23]) * 2;
    const vol = Math.min(64, modBytes[h + 25]);
    let lstart = ((modBytes[h + 26] << 8) | modBytes[h + 27]) * 2;
    let llen = ((modBytes[h + 28] << 8) | modBytes[h + 29]) * 2;
    if (llen <= 2 || lstart + llen > len) { lstart = 0; llen = 0; }
    const data = (len > 0 && sOff + len <= modBytes.length) ? modBytes.subarray(sOff, sOff + len) : new Uint8Array(0);
    samples.push({ data, vol, lstart, llen });
    sOff += len;
  }

  const mixer = new ReferenceMixer(4);
  const chState = Array.from({ length: 4 }, () => ({
    smp: 0, period: 0, vol: 0, eff: 0, param: 0,
    targetPer: 0, portaSpd: 0, vibPos: 0, vibParam: 0,
    delayPer: 0, delaySmp: 0, delayTick: 0
  }));

  const trigger = (ch, smpIdx, per, offBytes) => {
    const smp = samples[smpIdx];
    if (!smp || smp.data.length === 0 || per <= 0) return;
    let data = smp.data;
    let ls = smp.lstart, ll = smp.llen;
    if (offBytes > 0) {
      if (offBytes >= data.length) { mixer.stop(ch); return; }
      data = data.subarray(offBytes);
      if (ll > 0) {
        if (ls >= offBytes) ls -= offBytes;
        else { ls = 0; ll = 0; }
      }
    }
    mixer.trigger(ch, {
      samples: data, bits: 8, stepFP: periodToStepFP(per),
      volume: chState[ch].vol, pan: CH_PAN[ch], loopStart: ls, loopLength: ll
    });
  };

  let order = 0, row = 0, tick = 0, speed = 6, bpm = 125;
  let patJump = -1, patBreak = -1;
  const chunks = [];
  let totalSamples = 0;

  for (let t = 0; t < maxTicks && order < songLen; t++) {
    if (tick === 0) {
      patJump = -1; patBreak = -1;
      const pat = orders[order];
      const rOff = 1084 + pat * 1024 + row * 16;
      for (let ch = 0; ch < 4; ch++) {
        const p = rOff + ch * 4;
        const b0 = modBytes[p], b1 = modBytes[p + 1], b2 = modBytes[p + 2], b3 = modBytes[p + 3];
        const smp = (b0 & 0xF0) | (b2 >>> 4);
        const per = ((b0 & 0x0F) << 8) | b1;
        const eff = b2 & 0x0F;
        const param = b3;
        const st = chState[ch];
        st.eff = eff; st.param = param; st.delayTick = 0;

        if (smp > 0 && smp <= 31) {
          st.smp = smp;
          st.vol = samples[smp].vol;
          mixer.setVolumePan(ch, st.vol, CH_PAN[ch]);
        }
        if (eff === 0xE && (param >>> 4) === 0xD && (param & 0x0F) > 0) {
          st.delayPer = per; st.delaySmp = st.smp; st.delayTick = param & 0x0F;
          continue;
        }
        if (eff === 3) {
          if (per > 0) st.targetPer = per;
          if (param > 0) st.portaSpd = param;
        } else if (per > 0) {
          st.period = per; st.vibPos = 0;
          trigger(ch, st.smp, per, eff === 9 ? param * 256 : 0);
        }
        if (eff === 4 && param !== 0) {
          const vx = (param >>> 4) || (st.vibParam >>> 4);
          const vy = (param & 0x0F) || (st.vibParam & 0x0F);
          st.vibParam = (vx << 4) | vy;
        } else if (eff === 0xB) {
          patJump = param;
        } else if (eff === 0xC) {
          st.vol = Math.min(64, param);
          mixer.setVolumePan(ch, st.vol, CH_PAN[ch]);
        } else if (eff === 0xD) {
          patBreak = (param >>> 4) * 10 + (param & 0x0F);
          if (patBreak >= 64) patBreak = 0;
        } else if (eff === 0xF) {
          if (param > 0 && param < 32) speed = param;
          else if (param >= 32) bpm = param;
        }
      }
    } else {
      for (let ch = 0; ch < 4; ch++) {
        const st = chState[ch];
        if (st.delayTick > 0 && tick === st.delayTick) {
          if (st.delayPer > 0) { st.period = st.delayPer; trigger(ch, st.delaySmp, st.delayPer, 0); }
          st.delayTick = 0;
        }
        if (st.eff === 0 && st.param !== 0 && st.period > 0) {
          const step = tick % 3;
          const semi = step === 1 ? (st.param >>> 4) : (step === 2 ? (st.param & 0x0F) : 0);
          const ni = Math.min(35, nearestPeriodIndex(st.period) + semi);
          mixer.setStep(ch, periodToStepFP(PT_PERIODS[ni]));
        } else if (st.eff === 1 && st.period > 0) {
          st.period = Math.max(113, st.period - st.param);
          mixer.setStep(ch, periodToStepFP(st.period));
        } else if (st.eff === 2 && st.period > 0) {
          st.period = Math.min(856, st.period + st.param);
          mixer.setStep(ch, periodToStepFP(st.period));
        } else if (st.eff === 3 && st.period > 0 && st.targetPer > 0 && st.portaSpd > 0) {
          if (st.period < st.targetPer) st.period = Math.min(st.targetPer, st.period + st.portaSpd);
          else if (st.period > st.targetPer) st.period = Math.max(st.targetPer, st.period - st.portaSpd);
          mixer.setStep(ch, periodToStepFP(st.period));
        } else if (st.eff === 4 && st.period > 0) {
          const spd = st.vibParam >>> 4;
          const dep = st.vibParam & 0x0F;
          const delta = (PT_SINE[st.vibPos & 31] * dep) >>> 7;
          const np = (st.vibPos & 32) ? (st.period - delta) : (st.period + delta);
          st.vibPos = (st.vibPos + spd) & 63;
          mixer.setStep(ch, periodToStepFP(np));
        } else if (st.eff === 0xA) {
          const up = st.param >>> 4, dn = st.param & 0x0F;
          st.vol = Math.max(0, Math.min(64, up > 0 ? st.vol + up : st.vol - dn));
          mixer.setVolumePan(ch, st.vol, CH_PAN[ch]);
        } else if (st.eff === 0xE && (st.param >>> 4) === 0xC) {
          if (tick === (st.param & 0x0F)) {
            st.vol = 0;
            mixer.setVolumePan(ch, 0, CH_PAN[ch]);
          }
        }
      }
    }

    const frames = Math.trunc(55125 / bpm);
    const chunk = mixer.renderFrames(frames);
    chunks.push(chunk);
    totalSamples += chunk.length;

    tick++;
    if (tick >= speed) {
      tick = 0;
      if (patJump >= 0) { order = patJump; row = patBreak >= 0 ? patBreak : 0; }
      else if (patBreak >= 0) { order++; row = patBreak; }
      else { row++; if (row >= 64) { row = 0; order++; } }
    }
  }

  const out = new Int16Array(totalSamples);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

module.exports = { buildProceduralMod, renderModReference, PT_PERIODS };
