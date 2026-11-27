// ============================================================================
// SpiralOS 1.7 "Bring Your Own" — 8-Channel PCM Audio Mixer (/src/audio.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Machine-independent 8-channel stereo 16-bit PCM mixer at 22,050 Hz.
// Supports 8-bit signed and 16-bit signed LE samples, 16.16 fixed-point
// resampling, per-channel volume (0..64) and linear pan (0=L, 128=C, 256=R),
// looping, and PCM tone synthesis (so SYS_SOUND_TONE works on Triton too).
// ============================================================================

const PC_AUDIO_DROP_LAST = 0;
const PC_AUDIO_SWAP_PAN  = 0;

const AUD_MAX_CH     = 8;
const AUD_CH_BASE    = 0x047A00; // 8 channels * 40 bytes = 320 B (0x047A00..0x047B3F)
const AUD_CH_STRIDE  = 40;
// Channel fields (offsets in bytes):
//  0: active (0/1)
//  4: sample_ptr (VM RAM addr)
//  8: sample_len (in samples)
// 12: sample_bits (8 or 16)
// 16: pos_fp (unsigned 16.16 fixed-point sample index)
// 20: step_fp (unsigned 16.16 fixed-point increment per output frame)
// 24: vol (0..64)
// 28: pan (0..256: 0=left, 128=center, 256=right)
// 32: loop_start (in samples)
// 36: loop_len (in samples, 0 = no loop)

int g_aud_mix_buf;

int audio_caps() {
  return hal_audio_info(0);
}

int audio_rate() {
  int r = hal_audio_info(1);
  if (r <= 0) r = 22050;
  return r;
}

void audio_reset() {
  hal_memset(AUD_CH_BASE, 0, AUD_MAX_CH * AUD_CH_STRIDE);
}

int audio_ensure_buf() {
  if (g_aud_mix_buf == 0) {
    g_aud_mix_buf = heap_alloc(4096); // up to 1024 stereo 16-bit frames per chunk
  }
  return g_aud_mix_buf;
}

void audio_ch_play(int ch, int ptr, int len, int bits, int step_fp, int vol, int pan, int loop_start, int loop_len) {
  if (ch < 0 || ch >= AUD_MAX_CH) return;
  int b = AUD_CH_BASE + ch * AUD_CH_STRIDE;
  if (ptr == 0 || len <= 0) {
    w32(b + 0, 0);
    return;
  }
  if (bits != 16) bits = 8;
  if (vol < 0) vol = 0;
  if (vol > 64) vol = 64;
  if (pan < 0) pan = 0;
  if (pan > 256) pan = 256;
  w32(b + 4, ptr);
  w32(b + 8, len);
  w32(b + 12, bits);
  w32(b + 16, 0);
  w32(b + 20, step_fp);
  w32(b + 24, vol);
  w32(b + 28, pan);
  w32(b + 32, loop_start);
  w32(b + 36, loop_len);
  w32(b + 0, 1);
}

void audio_ch_stop(int ch) {
  if (ch < 0 || ch >= AUD_MAX_CH) return;
  w32(AUD_CH_BASE + ch * AUD_CH_STRIDE, 0);
}

void audio_ch_set_vol_pan(int ch, int vol, int pan) {
  if (ch < 0 || ch >= AUD_MAX_CH) return;
  if (vol < 0) vol = 0;
  if (vol > 64) vol = 64;
  if (pan < 0) pan = 0;
  if (pan > 256) pan = 256;
  int b = AUD_CH_BASE + ch * AUD_CH_STRIDE;
  w32(b + 24, vol);
  w32(b + 28, pan);
}

void audio_ch_set_step(int ch, int step_fp) {
  if (ch < 0 || ch >= AUD_MAX_CH) return;
  w32(AUD_CH_BASE + ch * AUD_CH_STRIDE + 20, step_fp);
}

int audio_mix_render(int dst_buf, int num_frames) {
  if (dst_buf == 0 || num_frames <= 0) return 0;
  for (int f = 0; f < num_frames; f++) {
    int mix_l = 0;
    int mix_r = 0;
    for (int ch = 0; ch < AUD_MAX_CH; ch++) {
      int b = AUD_CH_BASE + ch * AUD_CH_STRIDE;
      if (r32(b + 0) == 0) continue;
      int pos_fp = r32(b + 16);
      int idx = pos_fp >>> 16;
      int slen = r32(b + 8);
      if (idx >= slen) {
        int llen = r32(b + 36);
        if (llen > 0) {
          int lstart = r32(b + 32);
          int rel = (idx - lstart) % llen;
          idx = lstart + rel;
          pos_fp = (idx << 16) | (pos_fp & 0xFFFF);
        } else {
          w32(b + 0, 0);
          continue;
        }
      }
      int sptr = r32(b + 4);
      int bits = r32(b + 12);
      int s = 0;
      if (bits == 8) {
        int sb = r8(sptr + idx);
        if (sb >= 128) sb = sb - 256;
        s = sb << 8;
      } else {
        int lo = r8(sptr + idx * 2);
        int hi = r8(sptr + idx * 2 + 1);
        s = lo | (hi << 8);
        if (s >= 32768) s = s - 65536;
      }
      w32(b + 16, pos_fp + r32(b + 20));
      int vol = r32(b + 24);
      int pan = r32(b + 28);
      int l_gain = (vol * (256 - pan)) >> 8;
      int r_gain = (vol * pan) >> 8;
      if (PC_AUDIO_SWAP_PAN == 1) {
        int tmp_g = l_gain;
        l_gain = r_gain;
        r_gain = tmp_g;
      }
      mix_l = mix_l + ((s * l_gain) >> 8);
      mix_r = mix_r + ((s * r_gain) >> 8);
    }
    if (mix_l > 32767) mix_l = 32767;
    if (mix_l < -32768) mix_l = -32768;
    if (mix_r > 32767) mix_r = 32767;
    if (mix_r < -32768) mix_r = -32768;
    int off = dst_buf + f * 4;
    w8(off + 0, mix_l & 0xFF);
    w8(off + 1, (mix_l >>> 8) & 0xFF);
    w8(off + 2, mix_r & 0xFF);
    w8(off + 3, (mix_r >>> 8) & 0xFF);
  }
  return num_frames;
}

int audio_mix_submit(int num_frames) {
  if (num_frames <= 0) return 0;
  if (hal_audio_info(0) == 0) return -1;
  int buf = audio_ensure_buf();
  if (buf == 0) return -1;
  int rem = num_frames;
  int total = 0;
  while (rem > 0) {
    int chunk = rem;
    if (chunk > 1024) chunk = 1024;
    audio_mix_render(buf, chunk);
    int send_n = chunk;
    if (PC_AUDIO_DROP_LAST == 1 && send_n > 1) send_n = send_n - 1;
    int w = hal_audio_write(buf, send_n);
    if (w < 0) return w;
    total = total + w;
    rem = rem - chunk;
  }
  return total;
}

int audio_tone(int freq_hz, int dur_ms) {
  if (freq_hz < 40) freq_hz = 40;
  if (freq_hz > 8000) freq_hz = 8000;
  if (dur_ms < 10) dur_ms = 10;
  if (dur_ms > 2000) dur_ms = 2000;
  int caps = hal_audio_info(0);
  if (caps == 0) {
    // Hardware has no PCM device (e.g., bare-metal x86 without SB16); try legacy PC speaker
    return sys(15, freq_hz, dur_ms);
  }
  int rate = audio_rate();
  int total_frames = (rate * dur_ms) / 1000;
  if (total_frames <= 0) return 0;
  int buf = audio_ensure_buf();
  if (buf == 0) return -1;
  int half_per = rate / (freq_hz * 2);
  if (half_per < 1) half_per = 1;
  int phase = 0;
  int rem = total_frames;
  int sent = 0;
  while (rem > 0) {
    int chunk = rem;
    if (chunk > 512) chunk = 512;
    for (int i = 0; i < chunk; i++) {
      int v = 6000;
      if (((phase / half_per) & 1) != 0) v = -6000;
      int off = buf + i * 4;
      w8(off + 0, v & 0xFF);
      w8(off + 1, (v >>> 8) & 0xFF);
      w8(off + 2, v & 0xFF);
      w8(off + 3, (v >>> 8) & 0xFF);
      phase = phase + 1;
    }
    int w = hal_audio_write(buf, chunk);
    if (w < 0) return w;
    sent = sent + w;
    rem = rem - chunk;
  }
  return sent;
}
