/**
 * SpiralOS — Shared Headless Test Harness (Loads TabComp & Hummingbird directly from HTML)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Ensures zero code duplication: evaluates the exact <script> blocks inside
 * tabcomp.html and hummingbird.html in Node.js, plus provides a pure-Node
 * zlib PNG encoder to save real renderer screenshots.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const crypto = require("crypto");

let loaded = false;

function loadEmulators() {
  if (loaded) return;
  loaded = true;

  const rootDir = path.resolve(__dirname, "..");
  const tcHtml = fs.readFileSync(path.join(rootDir, "tabcomp.html"), "utf8");
  const styleMatch = tcHtml.match(/<style id="tc-style">([\s\S]*?)<\/style>/);
  const diskMatch = tcHtml.match(/<script type="application\/x-tabcomp-disk" id="tc-disk">([\s\S]*?)<\/script>/);
  const coreMatch = tcHtml.match(/<script id="tc-core">([\s\S]*?)<\/script>/);

  const dummyEl = () => ({
    textContent: "",
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    getContext() {
      return {
        createImageData() { return { data: new Uint8ClampedArray(320 * 200 * 4) }; },
        putImageData() {}
      };
    },
    focus() {}
  });

  globalThis.window = globalThis;
  globalThis.window.addEventListener = () => {};
  globalThis.window.requestAnimationFrame = () => {};
  globalThis.Blob = class {};
  globalThis.URL = { createObjectURL() { return ""; }, revokeObjectURL() {} };
  globalThis.document = {
    getElementById(id) {
      if (id === "tc-style") return { textContent: styleMatch[1] };
      if (id === "tc-disk") return { textContent: diskMatch[1] };
      if (id === "tc-core") return { textContent: coreMatch[1] };
      return dummyEl();
    },
    querySelector() { return dummyEl(); },
    createElement() { return dummyEl(); },
    body: dummyEl()
  };

  vm.runInThisContext(coreMatch[1]);

  const hbHtml = fs.readFileSync(path.join(rootDir, "hummingbird.html"), "utf8");
  const hbMatch = hbHtml.match(/<script id="hummingbird-core">([\s\S]*?)<\/script>/);
  vm.runInThisContext(hbMatch[1]);
}

// Pure Node.js PNG encoder (RGBA Uint32Array 0xAABBGGRR -> PNG file)
function encodePNG(width, height, rgba32) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const u8 = new Uint8Array(rgba32.buffer, rgba32.byteOffset, rgba32.byteLength);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter type 0 (None)
    const srcOff = y * width * 4;
    for (let i = 0; i < width * 4; i++) {
      raw[rowStart + 1 + i] = u8[srcOff + i];
    }
  }
  const idatData = zlib.deflateSync(raw, { level: 6 });

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(typeStr, dataBuf) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);
    const typeBuf = Buffer.from(typeStr, "ascii");
    const crcInput = Buffer.concat([typeBuf, dataBuf]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function renderTabCompRGBA(cpu) {
  const rgba32 = new Uint32Array(320 * 200);
  const imgData = { data: new Uint8ClampedArray(rgba32.buffer) };
  const ctx2d = { putImageData() {} };
  globalThis.renderFramebufferToCanvas(cpu, ctx2d, imgData);
  return { width: 320, height: 200, rgba: rgba32 };
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

module.exports = {
  loadEmulators,
  encodePNG,
  renderTabCompRGBA,
  sha256Hex
};
