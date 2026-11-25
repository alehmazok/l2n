#!/usr/bin/env node
/**
 * Regenerates item and skill icons from packages/client/src/assets/icons/manifest.json
 * through the Venice API, for example with a better model than the first set used.
 *
 *   VENICE_API_KEY=… node scripts/generate-icons.mjs [--model <id>] [--only id,id] [--dry-run]
 *
 * Each icon keeps its prompt and seed; --model swaps the model for the icons
 * generated. Raw 1024 px PNGs go to a temporary folder, then ImageMagick
 * (`magick`) applies the icon's `postprocess` step (crop the margin, scale,
 * WebP) into the assets folder, and the manifest is updated with the model and
 * date. Review the new icons before committing them.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const dir = new URL("../packages/client/src/assets/icons/", import.meta.url).pathname;
const manifestPath = join(dir, "manifest.json");

const { values } = parseArgs({
  options: { model: { type: "string" }, only: { type: "string" }, "dry-run": { type: "boolean", default: false } },
});
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const only = values.only ? new Set(values.only.split(",")) : null;
const icons = manifest.icons.filter((i) => !only || only.has(i.id));
if (only && icons.length !== only.size) throw new Error(`Unknown icon id in --only: ${values.only}`);

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
    seed: p.seed,
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
  const side = Math.round(icon.parameters.width * (1 - 2 * cropInset));
  const offset = Math.round(icon.parameters.width * cropInset);
  execFileSync("magick", [png, "-crop", `${side}x${side}+${offset}+${offset}`, "+repage", "-resize", `${size}x${size}`, "-quality", String(quality), `${format}:${join(dir, icon.file)}`]);
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
  if (body.steps === undefined) delete icon.parameters.steps;
  icon.generated = today;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${icon.id}: done`);
}
if (!values["dry-run"]) console.log(`Raw images: ${raw}`);
