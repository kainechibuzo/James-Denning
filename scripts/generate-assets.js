/**
 * JAMES-DENNING — App Icon & Splash Screen Generator (monochrome brand)
 * Run: node scripts/generate-assets.js
 *
 * Root cause fixed in v3:
 *   v2 produced icon-only.png with channels:4 / hasAlpha:true even though all pixels
 *   were opaque. capacitor-assets saw the alpha channel and treated the image as a
 *   transparent-background foreground icon, placing a white system background behind
 *   it on dark home screens.
 *
 *   Fix: output icon-only.png as JPEG (quality 100). JPEG has NO alpha channel by
 *   definition — capacitor-assets cannot treat it as transparent. splash.png stays
 *   PNG but with .flatten() to guarantee channels:3.
 *
 * Logo transparency:
 *   assets/logo.png has hasAlpha:true with transparent corners — it composites
 *   cleanly onto the #111827 charcoal canvas WITHOUT pre-flattening. The letterbox padding uses
 *   alpha:0 so the #111827 charcoal canvas shows through instead of a solid colour band.
 *
 * Outputs:
 *   assets/icon-only.png  — 1024×1024, solid #111827 charcoal #111827, JPEG (no alpha)
 *   assets/splash.png     — 2732×2732, solid #111827 charcoal #111827, PNG, channels:3 (no alpha)
 */

const sharp  = require("sharp");
const path   = require("path");
const fs     = require("fs");

const ROOT        = path.resolve(__dirname, "..");
const LOGO_PATH   = path.join(ROOT, "assets", "logo.png");
const ICON_PATH   = path.join(ROOT, "assets", "icon-only.png");
const SPLASH_PATH = path.join(ROOT, "assets", "splash.png");

// Brand colours
const CHARCOAL        = { r: 17,  g: 24,  b: 39 };           // #111827
const CHARCOAL_ALPHA0 = { r: 17,  g: 24,  b: 39, alpha: 0 }; // transparent letterbox
const ACCENT_HEX  = "#9CA3AF";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Verify saved file: check format, alpha channel, corner pixel colour. */
async function verify(filePath) {
  const meta = await sharp(filePath).metadata();
  const stat = fs.statSync(filePath);
  const kb   = (stat.size / 1024).toFixed(1);

  const raw = await sharp(filePath)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  const [r, g, b, a] = [raw[0], raw[1], raw[2], raw[3]];
  const alphaStr = a !== undefined ? `  alpha:${a}` : "  (no alpha in raw)";

  console.log(`  ✓  ${path.relative(ROOT, filePath)}  (${kb} KB)`);
  console.log(`     format:${meta.format}  ${meta.width}×${meta.height}  channels:${meta.channels}  hasAlpha:${meta.hasAlpha}`);
  console.log(`     corner pixel RGB: ${r} ${g} ${b}${alphaStr}`);

  const charcoalOk = (r === CHARCOAL.r && g === CHARCOAL.g && b === CHARCOAL.b);
  console.log(charcoalOk
    ? "     ✅ Background is solid #111827 charcoal #111827"
    : `  ⚠  Corner pixel is NOT #111827 charcoal! Expected ${CHARCOAL.r} ${CHARCOAL.g} ${CHARCOAL.b}`);

  console.log(meta.hasAlpha
    ? "  ⚠  File has alpha channel — capacitor-assets may show white background!"
    : "     ✅ No alpha channel — safe for capacitor-assets");
}

// ─── STEP 1: icon-only.png  (1024×1024, JPEG, no alpha) ───────────────────────
async function generateIcon() {
  console.log("\n[1/2] Generating icon-only.png (1024×1024, JPEG, no alpha)…");

  const SIZE    = 1024;
  const LOGO_PX = 820;   // ≈80% of 1024

  // Resize logo, keeping its OWN transparency intact.
  // Letterbox padding = transparent #111827 charcoal so the canvas #111827 charcoal shows through cleanly.
  const logoResized = await sharp(LOGO_PATH)
    .resize(LOGO_PX, LOGO_PX, {
      fit:        "contain",
      background: CHARCOAL_ALPHA0,   // transparent letterbox — NO flatten here
    })
    .png()                       // keep RGBA so transparency composites correctly
    .toBuffer();

  // Create solid #111827 charcoal canvas (channels:3) → composite logo → save as JPEG.
  // JPEG encoding strips the alpha channel at the codec level — guaranteed no alpha.
  fs.mkdirSync(path.dirname(ICON_PATH), { recursive: true });

  await sharp({
    create: {
      width:    SIZE,
      height:   SIZE,
      channels: 3,               // RGB only
      background: CHARCOAL,
    },
  })
  .composite([{
    input:   logoResized,
    gravity: "center",
  }])
  .jpeg({ quality: 100 })        // ← JPEG = zero alpha channel, ever
  .toFile(ICON_PATH);

  await verify(ICON_PATH);
}

// ─── STEP 2: splash.png (2732×2732, PNG, channels:3) ─────────────────────────
async function generateSplash() {
  console.log("\n[2/2] Generating splash.png (2732×2732, PNG, no alpha)…");

  const SIZE    = 2732;
  const LOGO_W  = 700;
  // Preserve original logo aspect ratio (698 × 604)
  const LOGO_H  = Math.round(LOGO_W * (604 / 698));

  // Text layout
  const TITLE_FONT = 96;
  const SUBTITLE_FONT = 72;
  const GAP         = 36;   // gap: logo bottom → first text baseline
  const LINE_GAP    = 20;   // gap between two text lines

  const totalGroupH = LOGO_H + GAP + TITLE_FONT + LINE_GAP + SUBTITLE_FONT;
  const groupTop    = Math.round((SIZE - totalGroupH) / 2);

  const logoTop  = groupTop;
  const logoLeft = Math.round((SIZE - LOGO_W) / 2);
  const text1Y   = logoTop + LOGO_H + GAP + TITLE_FONT;   // baseline: brand name
  const text2Y   = text1Y + LINE_GAP + SUBTITLE_FONT;        // baseline: "OPERATIONS"

  // Solid #111827 charcoal background canvas (channels:3, no alpha)
  const bgBuf = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: CHARCOAL },
  }).png().toBuffer();

  // Logo — keep its OWN transparency; transparent letterbox shows #111827 charcoal through
  const logo = await sharp(LOGO_PATH)
    .resize(LOGO_W, LOGO_H, {
      fit:        "contain",
      background: CHARCOAL_ALPHA0,
    })
    .png()
    .toBuffer();

  // SVG text overlay (transparent SVG — only text pixels matter)
  const svgText = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <text
    x="${SIZE / 2}" y="${text1Y}"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${TITLE_FONT}"
    font-weight="bold"
    fill="white"
    letter-spacing="6">JAMES-DENNING</text>

  <text
    x="${SIZE / 2}" y="${text2Y}"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${SUBTITLE_FONT}"
    font-weight="bold"
    fill="${ACCENT_HEX}"
    letter-spacing="14">OPERATIONS</text>
</svg>`);

  // Composite: #111827 charcoal bg → logo → text → flatten (kills any residual alpha) → PNG
  const splashBuf = await sharp(bgBuf)
    .composite([
      { input: logo,    top: logoTop,  left: logoLeft, blend: "over" },
      { input: svgText, top: 0,        left: 0,        blend: "over" },
    ])
    .flatten({ background: CHARCOAL })   // guarantee channels:3, kill any residual alpha
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(SPLASH_PATH), { recursive: true });
  fs.writeFileSync(SPLASH_PATH, splashBuf);
  await verify(SPLASH_PATH);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════");
  console.log("  JAMES-DENNING — Asset Generator  v3");
  console.log(`  #111827 Charcoal: rgb(${CHARCOAL.r},${CHARCOAL.g},${CHARCOAL.b})  #111827`);
  console.log("═══════════════════════════════════════════════");

  if (!fs.existsSync(LOGO_PATH)) {
    console.error(`\n❌  Logo not found at: ${LOGO_PATH}`);
    process.exit(1);
  }

  const logoMeta = await sharp(LOGO_PATH).metadata();
  console.log(`\n  Logo: ${logoMeta.width}×${logoMeta.height}  channels:${logoMeta.channels}  hasAlpha:${logoMeta.hasAlpha}`);

  if (!logoMeta.hasAlpha) {
    console.warn("  ⚠  Logo has no alpha channel — white background will be treated as opaque white pixels.");
    console.warn("     The icon MAY still show white. Consider pre-processing the logo to add transparency.");
  } else {
    console.log("  ✅ Logo has alpha — transparent background composites cleanly onto #111827 charcoal.");
  }

  await generateIcon();
  await generateSplash();

  console.log("\n═══════════════════════════════════════════════");
  console.log("  All assets generated.");
  console.log("  ✅ icon-only.png = JPEG, no alpha channel");
  console.log("  ✅ splash.png    = PNG, channels:3, no alpha");
  console.log("\n  Run next:");
  console.log("    npx capacitor-assets generate --android");
  console.log("    npm run build && npx cap sync android");
  console.log("═══════════════════════════════════════════════\n");
})();
