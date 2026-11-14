#!/usr/bin/env node
/**
 * SpiralOS 1.4 "Daily Driver" — Build-Time SVG Splash Logo Rasterizer (tools/rasterize-splash.js)
 * Studio: ConsciousNode SoftWorks · Licence: MIT
 *
 * Parses the attached cnsw-mark.svg (viewBox 0 0 800 800) at build time with
 * 4x4 supersampled distance-field anti-aliasing into an 80x80 8-bpp SpiralOS
 * palette bitmap (/art/cnsw.pic) stored in the unified image.
 * No SVG parser exists inside SpiralOS.
 */

"use strict";

const fs = require("fs");
const path = require("path");

function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function parseSvgMark(svgText) {
  // 1. Extract clipPath rect
  const clipMatch = svgText.match(/<clipPath[^>]*>\s*<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/);
  const clip = clipMatch
    ? {
        x0: parseFloat(clipMatch[1]),
        y0: parseFloat(clipMatch[2]),
        x1: parseFloat(clipMatch[1]) + parseFloat(clipMatch[3]),
        y1: parseFloat(clipMatch[2]) + parseFloat(clipMatch[4])
      }
    : { x0: 120, y0: 120, x1: 680, y1: 680 };

  // 2. Extract spiral <path d="..." stroke-width="..." stroke-opacity="...">
  const pathMatch = svgText.match(/<path\s+d="([^"]+)"[^>]*stroke-width="([\d.]+)"[^>]*stroke-opacity="([\d.]+)"/);
  const pathPts = [];
  let pathHalfW = 3.0;
  let pathOpacity = 0.32;
  if (pathMatch) {
    pathHalfW = parseFloat(pathMatch[2]) * 0.5;
    pathOpacity = parseFloat(pathMatch[3]);
    const coords = pathMatch[1].match(/[\d.]+/g).map(Number);
    for (let i = 0; i + 1 < coords.length; i += 2) {
      pathPts.push([coords[i], coords[i + 1]]);
    }
  }

  // 3. Extract outer <rect x="120" y="120" width="560" height="560" ... stroke-width="9"/>
  const rectMatch = svgText.match(/<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"\s+fill="none"\s+stroke="#4ade80"\s+stroke-width="([\d.]+)"/);
  const rect = rectMatch
    ? {
        x0: parseFloat(rectMatch[1]),
        y0: parseFloat(rectMatch[2]),
        x1: parseFloat(rectMatch[1]) + parseFloat(rectMatch[3]),
        y1: parseFloat(rectMatch[2]) + parseFloat(rectMatch[4]),
        halfW: parseFloat(rectMatch[5]) * 0.5
      }
    : { x0: 120, y0: 120, x1: 680, y1: 680, halfW: 4.5 };

  // 4. Extract outer <circle cx="400" cy="400" r="280" fill="none" stroke="#4ade80" stroke-width="8"/>
  const circleStrokeMatch = svgText.match(/<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"\s+fill="none"\s+stroke="#4ade80"\s+stroke-width="([\d.]+)"/);
  const outerCircle = circleStrokeMatch
    ? {
        cx: parseFloat(circleStrokeMatch[1]),
        cy: parseFloat(circleStrokeMatch[2]),
        r: parseFloat(circleStrokeMatch[3]),
        halfW: parseFloat(circleStrokeMatch[4]) * 0.5
      }
    : { cx: 400, cy: 400, r: 280, halfW: 4.0 };

  // 5. Extract <polygon points="..." fill="none" stroke="#4ade80" stroke-width="8"/>
  const polyMatch = svgText.match(/<polygon\s+points="([^"]+)"\s+fill="none"\s+stroke="#4ade80"\s+stroke-width="([\d.]+)"/);
  const polyPts = [];
  let polyHalfW = 4.0;
  if (polyMatch) {
    polyHalfW = parseFloat(polyMatch[2]) * 0.5;
    for (const pair of polyMatch[1].trim().split(/\s+/)) {
      const [px, py] = pair.split(",").map(Number);
      polyPts.push([px, py]);
    }
  }

  // 6. Extract center filled <circle cx="400" cy="400" r="26" fill="#4ade80"/>
  const dotMatch = svgText.match(/<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"\s+fill="#4ade80"/);
  const centerDot = dotMatch
    ? {
        cx: parseFloat(dotMatch[1]),
        cy: parseFloat(dotMatch[2]),
        r: parseFloat(dotMatch[3])
      }
    : { cx: 400, cy: 400, r: 26 };

  return { clip, pathPts, pathHalfW, pathOpacity, rect, outerCircle, polyPts, polyHalfW, centerDot };
}

function rasterizeCnswMark(svgPath, width = 80, height = 80) {
  const svgText = fs.readFileSync(svgPath, "utf8");
  const g = parseSvgMark(svgText);
  const out = new Uint8Array(width * height);

  // Map 800x800 viewBox window [88..712] onto [0..width, 0..height] so the 560x560 mark fills 72x72 with 4px margin
  const vbMin = 88.0;
  const vbSpan = 624.0;
  const scale = vbSpan / width;
  // Minimum stroke thickness in viewBox units so 1px lines at 80x80 stay crisp
  const minHalfStroke = scale * 0.58;

  const rectHW = Math.max(g.rect.halfW, minHalfStroke);
  const circHW = Math.max(g.outerCircle.halfW, minHalfStroke);
  const polyHW = Math.max(g.polyHalfW, minHalfStroke);
  const pathHW = Math.max(g.pathHalfW, scale * 0.48);

  // SpiralOS emerald palette ramp (indices 80..95) + EGA bright green (10) + pure black (0)
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let fgAcc = 0;
      const ss = 3; // 3x3 supersampling per pixel
      for (let sy = 0; sy < ss; sy++) {
        const vy = vbMin + ((py + (sy + 0.5) / ss) / height) * vbSpan;
        for (let sx = 0; sx < ss; sx++) {
          const vx = vbMin + ((px + (sx + 0.5) / ss) / width) * vbSpan;
          let sampleAlpha = 0.0;

          // 1. Center filled circle
          const dCenter = Math.hypot(vx - g.centerDot.cx, vy - g.centerDot.cy);
          if (dCenter <= g.centerDot.r) {
            sampleAlpha = 1.0;
          } else {
            // 2. Outer circle stroke
            if (Math.abs(dCenter - g.outerCircle.r) <= circHW) {
              sampleAlpha = 1.0;
            }
            // 3. Outer square rect stroke
            if (sampleAlpha < 1.0) {
              const inX = vx >= g.rect.x0 - rectHW && vx <= g.rect.x1 + rectHW;
              const inY = vy >= g.rect.y0 - rectHW && vy <= g.rect.y1 + rectHW;
              if (inX && inY) {
                const dLeft = Math.abs(vx - g.rect.x0);
                const dRight = Math.abs(vx - g.rect.x1);
                const dTop = Math.abs(vy - g.rect.y0);
                const dBot = Math.abs(vy - g.rect.y1);
                if (Math.min(dLeft, dRight, dTop, dBot) <= rectHW) {
                  sampleAlpha = 1.0;
                }
              }
            }
            // 4. Triangle polygon stroke
            if (sampleAlpha < 1.0 && g.polyPts.length >= 3) {
              for (let k = 0; k < g.polyPts.length; k++) {
                const [ax, ay] = g.polyPts[k];
                const [bx, by] = g.polyPts[(k + 1) % g.polyPts.length];
                if (distToSegment(vx, vy, ax, ay, bx, by) <= polyHW) {
                  sampleAlpha = 1.0;
                  break;
                }
              }
            }
            // 5. Clipped spiral path (opacity 0.32)
            if (
              sampleAlpha < g.pathOpacity &&
              vx >= g.clip.x0 &&
              vx <= g.clip.x1 &&
              vy >= g.clip.y0 &&
              vy <= g.clip.y1
            ) {
              for (let k = 0; k + 1 < g.pathPts.length; k++) {
                const [ax, ay] = g.pathPts[k];
                const [bx, by] = g.pathPts[k + 1];
                if (
                  vx < Math.min(ax, bx) - pathHW ||
                  vx > Math.max(ax, bx) + pathHW ||
                  vy < Math.min(ay, by) - pathHW ||
                  vy > Math.max(ay, by) + pathHW
                ) {
                  continue;
                }
                if (distToSegment(vx, vy, ax, ay, bx, by) <= pathHW) {
                  sampleAlpha = Math.max(sampleAlpha, g.pathOpacity);
                  break;
                }
              }
            }
          }
          fgAcc += sampleAlpha;
        }
      }

      const alpha = fgAcc / (ss * ss);
      if (alpha <= 0.04) {
        out[py * width + px] = 0; // pure black background
      } else if (alpha >= 0.82) {
        out[py * width + px] = 10; // bright CNSW #4ade80 green
      } else {
        // Map intermediate opacity (including 0.32 spiral) to emerald ramp 82..95
        const ramp = Math.max(82, Math.min(95, 80 + Math.round(alpha * 15)));
        out[py * width + px] = ramp;
      }
    }
  }
  return out;
}

if (require.main === module) {
  const svgPath = path.resolve(__dirname, "../../cnsw-mark.svg");
  const bmp = rasterizeCnswMark(svgPath, 80, 80);
  let nonZero = 0;
  let bright = 0;
  let spiral = 0;
  for (let i = 0; i < bmp.length; i++) {
    if (bmp[i] !== 0) nonZero++;
    if (bmp[i] === 10) bright++;
    else if (bmp[i] >= 80) spiral++;
  }
  console.log(`Rasterized cnsw-mark.svg -> 80x80 (${bmp.length} B): nonZero=${nonZero}, bright=${bright}, spiral/aa=${spiral}`);
}

module.exports = { rasterizeCnswMark };
