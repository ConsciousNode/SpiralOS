// ============================================================================
// SpiralOS 1.7 — Independent Clean-Room 8-Channel PCM Mixer Oracle
// (tests/audio-oracle.js) · Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Reference stereo 16-bit signed LE PCM mixer at 22,050 Hz written strictly
// from the mixer arithmetic specification (8/16-bit samples, 16.16 fixed-point
// phase step, linear pan 0..256, volume 0..64, 4x mix headroom >> 8, clamp).
// ============================================================================

"use strict";

class ReferenceMixer {
  constructor(channelCount = 8) {
    this.channels = Array.from({ length: channelCount }, () => ({
      active: false,
      samples: null,
      bits: 8,
      posFP: 0,
      stepFP: 65536,
      volume: 64,
      pan: 128,
      loopStart: 0,
      loopLength: 0
    }));
  }

  reset() {
    for (const c of this.channels) c.active = false;
  }

  trigger(ch, { samples, bits = 8, stepFP = 65536, volume = 64, pan = 128, loopStart = 0, loopLength = 0 }) {
    if (ch < 0 || ch >= this.channels.length) return;
    const slot = this.channels[ch];
    if (!samples || samples.length === 0) { slot.active = false; return; }
    slot.samples = samples;
    slot.bits = bits === 16 ? 16 : 8;
    slot.posFP = 0;
    slot.stepFP = stepFP | 0;
    slot.volume = Math.max(0, Math.min(64, volume | 0));
    slot.pan = Math.max(0, Math.min(256, pan | 0));
    slot.loopStart = loopStart | 0;
    slot.loopLength = loopLength | 0;
    slot.active = true;
  }

  stop(ch) {
    if (ch >= 0 && ch < this.channels.length) this.channels[ch].active = false;
  }

  setVolumePan(ch, volume, pan) {
    if (ch < 0 || ch >= this.channels.length) return;
    this.channels[ch].volume = Math.max(0, Math.min(64, volume | 0));
    this.channels[ch].pan = Math.max(0, Math.min(256, pan | 0));
  }

  setStep(ch, stepFP) {
    if (ch >= 0 && ch < this.channels.length) this.channels[ch].stepFP = stepFP | 0;
  }

  renderFrames(frameCount) {
    const pcm = new Int16Array(frameCount * 2);
    for (let f = 0; f < frameCount; f++) {
      let accL = 0;
      let accR = 0;
      for (const slot of this.channels) {
        if (!slot.active) continue;
        let idx = slot.posFP >>> 16;
        const len = slot.bits === 16 ? (slot.samples.length >>> 1) : slot.samples.length;
        if (idx >= len) {
          if (slot.loopLength > 0) {
            idx = slot.loopStart + ((idx - slot.loopStart) % slot.loopLength);
            slot.posFP = ((idx << 16) | (slot.posFP & 0xFFFF)) >>> 0;
          } else {
            slot.active = false;
            continue;
          }
        }
        let s;
        if (slot.bits === 8) {
          let b = slot.samples[idx] & 0xFF;
          if (b >= 128) b -= 256;
          s = b << 8;
        } else {
          const lo = slot.samples[idx * 2] & 0xFF;
          const hi = slot.samples[idx * 2 + 1] & 0xFF;
          s = lo | (hi << 8);
          if (s >= 32768) s -= 65536;
        }
        slot.posFP = (slot.posFP + slot.stepFP) >>> 0;
        const gL = (slot.volume * (256 - slot.pan)) >> 8;
        const gR = (slot.volume * slot.pan) >> 8;
        accL += (s * gL) >> 8;
        accR += (s * gR) >> 8;
      }
      if (accL > 32767) accL = 32767;
      if (accL < -32768) accL = -32768;
      if (accR > 32767) accR = 32767;
      if (accR < -32768) accR = -32768;
      pcm[f * 2] = accL;
      pcm[f * 2 + 1] = accR;
    }
    return pcm;
  }
}

module.exports = { ReferenceMixer };
