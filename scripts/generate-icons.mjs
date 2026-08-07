#!/usr/bin/env node
// scripts/generate-icons.mjs
// Lanse: node scripts/generate-icons.mjs
// (Bezwen: npm install sharp)

import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const ICONS_DIR = join(ROOT, "public", "icons");

// URL logo MillionStore (ibb.co)
const LOGO_URL  = "https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg";

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function run() {
  mkdirSync(ICONS_DIR, { recursive: true });

  // Télécharger le logo
  console.log("📥 Téléchargement du logo...");
  const res  = await fetch(LOGO_URL);
  const buf  = Buffer.from(await res.arrayBuffer());

  for (const size of SIZES) {
    const outPath = join(ICONS_DIR, `icon-${size}x${size}.png`);
    await sharp(buf)
      .resize(size, size, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toFile(outPath);
    console.log(`✅ icon-${size}x${size}.png`);
  }

  // Favicon 32x32
  await sharp(buf)
    .resize(32, 32, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(join(ICONS_DIR, "icon-32x32.png"));
  console.log("✅ icon-32x32.png");

  console.log("\n🎉 Tout icone yo prêt nan public/icons/");
}

run().catch(console.error);
