#!/usr/bin/env node
/**
 * Generates images from a manifest through the Venice API: the item and skill
 * icons (packages/client/src/assets/icons/manifest.json, the default) or the
 * larger art, mobs, scenes and portraits (--set art, assets/art/manifest.json).
 *
 *   VENICE_API_KEY=… node scripts/generate-icons.mjs [--set icons|art] [--model <id>] [--only id,id] [--seed-offset n] [--dry-run]
 *
 * Each image keeps its prompt and seed; --model swaps the model for the images
 * generated, and --seed-offset adds to every seed for another attempt (the
 * manifest records the seed used). Raw PNGs go to a temporary folder, then
 * ImageMagick (`magick`) applies the image's `postprocess` step (crop the
 * margin, scale, WebP) into the assets folder, and the manifest is updated
 * with the model and date. Review the new images before committing them.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "icons" },
    model: { type: "string" },
    only: { type: "string" },
    "seed-offset": { type: "string", default: "0" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!["icons", "art"].includes(values.set)) throw new Error("--set must be icons or art.");
const seedOffset = Number(values["seed-offset"]);
if (!Number.isInteger(seedOffset)) throw new Error("--seed-offset must be a whole number.");

const dir = new URL(`../packages/client/src/assets/${values.set}/`, import.meta.url).pathname;
const manifestPath = join(dir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const only = values.only ? new Set(values.only.split(",")) : null;
// The icon manifest lists its entries under `icons`, the art manifest under `images`.
const icons = (manifest.icons ?? manifest.images).filter((i) => !only || only.has(i.id));
if (only && icons.length !== only.size) throw new Error(`Unknown id in --only: ${values.only}`);

const key = process.env.VENICE_API_KEY;
if (!key && !values["dry-run"]) throw new Error("Set VENICE_API_KEY (or use --dry-run).");

const raw = mkdtempSync(join(tmpdir(), "l2n-icons-"));
const today = new Date().toISOString().slice(0, 10);

/** The Venice API request for an icon. Parameters the Studio UI set map onto the API's names. */
function request(icon) {
  const p = icon.parameters;
  return {
    model: values.model ?? icon.model,
    prompt: icon.prompt,
    width: p.width,
    height: p.height,
    seed: p.seed + seedOffset,
    format: "png",
    hide_watermark: true,
    safe_mode: false,
    embed_exif_metadata: false,
    // Steps differ between models; keep the old value only when the model stays the same.
    ...(values.model && values.model !== icon.model ? {} : { steps: p.steps }),
  };
}

/** Crop the margin, scale and encode, as the icon's `postprocess` says. */
function postprocess(icon, png) {
  const { cropInset, size, format, quality } = icon.postprocess;
  const { width, height } = icon.parameters;
  // `size` is the output width; the height keeps the aspect ratio of the generated image.
  const [w, h] = [width, height].map((v) => Math.round(v * (1 - 2 * cropInset)));
  const [x, y] = [width, height].map((v) => Math.round(v * cropInset));
  const out = join(dir, icon.file);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync("magick", [png, "-crop", `${w}x${h}+${x}+${y}`, "+repage", "-resize", `${size}x${Math.round((size * h) / w)}`, "-quality", String(quality), `${format}:${out}`]);
}

for (const icon of icons) {
  const body = request(icon);
  if (values["dry-run"]) {
    console.log(icon.id, JSON.stringify(body));
    continue;
  }
  const res = await fetch("https://api.venice.ai/api/v1/image/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${icon.id}: ${res.status} ${await res.text()}`);
  const { images } = await res.json();
  const png = join(raw, `${icon.id}.png`);
  writeFileSync(png, Buffer.from(images[0], "base64"));
  postprocess(icon, png);
  icon.model = body.model;
  icon.parameters.seed = body.seed;
  if (body.steps === undefined) delete icon.parameters.steps;
  icon.generated = today;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${icon.id}: done`);
}
if (!values["dry-run"]) console.log(`Raw images: ${raw}`);
