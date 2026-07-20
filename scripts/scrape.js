#!/usr/bin/env node
/**
 * TETON marketplace price monitor — v2 (Puppeteer rewrite)
 *
 * - Reads products + URLs LIVE from the Google Sheet (no urls.json step)
 * - Renders pages with headless Chrome (7 of 11 sites are client-side rendered)
 * - Parses Mexican price format correctly ($1,558.00 and ML's $1,356,42 cents style)
 * - Writes full snapshot (price, original, discount %, status) to "Monitoring Results" sheet
 * - Emits has_alerts output for the workflow so email fires only when needed
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { MARKETPLACES, SHEETS_CONFIG, THRESHOLDS } = require('../config');

const RESULTS_FILE = path.join(__dirname, '../data/results.json');
const ALERTS_FILE = path.join(__dirname, '../data/alerts.md');
const RESULTS_SHEET = 'Monitoring Results';
const NAV_TIMEOUT = 35000;
const SELECTOR_TIMEOUT = 20000;

/* ---------- helpers ---------- */

// Column letter -> zero-based index ("A"=0, "Q"=16, "AC"=28...)
function colIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Parse Mexican marketplace price text.
 * Handles: "$1,558.00", "$830 MXN", "$14.90/kg", "1,772.", and
 * MercadoLibre superscript cents: "$1,356,42" (last comma = decimal).
 */
function parseMoney(text) {
  if (!text) return null;
  const m = String(text).match(/\$?\s*([\d.,]+)/);
  if (!m) return null;
  let s = m[1].replace(/\.$/, '');
  if (/,\d{2}$/.test(s) && (s.match(/,/g) || []).length > 1) {
    // "1,356,42" -> last comma is cents
    const i = s.lastIndexOf(',');
    s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1);
  } else {
    s = s.replace(/,/g, '');
  }
  const val = parseFloat(s);
  return Number.isFinite(val) && val > 0 ? val : null;
}

// Extract a percentage. Prefers "(22%)" style, falls back to "22%" / "-13%".
function parsePercent(text) {
  if (!text) return null;
  const paren = String(text).match(/\((\d{1,3})\s*%\)/);
  if (paren) return parseInt(paren[1], 10);
  const plain = String(text).match(/(\d{1,3})\s*%/);
  return plain ? parseInt(plain[1], 10) : null;
}

/* ---------- sheet access ---------- */

async function openDoc() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var not set');
  const creds = JSON.parse(raw);
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(SHEETS_CONFIG.spreadsheetId, auth);
  await doc.loadInfo();
  return doc;
}

/**
 * Read products straight from the sheet by CELL POSITION (not header names):
 * A=name, B=SKU, C=shopify price, marketplace URLs in their configured columns.
 */
async function loadProducts(doc) {
  const sheet = doc.sheetsByTitle[SHEETS_CONFIG.tabName];
  if (!sheet) throw new Error(`Tab "${SHEETS_CONFIG.tabName}" not found`);
  await sheet.loadCells(); // whole tab; it is small

  const marketCols = Object.entries(MARKETPLACES).map(([key, cfg]) => ({
    key,
    idx: colIndex(cfg.column),
  }));

  const products = [];
  for (let r = 1; r < sheet.rowCount; r++) { // r=1 -> sheet row 2 (row 1 = headers)
    const name = sheet.getCell(r, 0).value;
    const sku = sheet.getCell(r, 1).value;
    if (!name || !sku) continue;

    const shopifyPrice = parseMoney(String(sheet.getCell(r, colIndex(SHEETS_CONFIG.shopifyPriceColumn || 'K')).value ?? ''));
    const urls = {};
    for (const { key, idx } of marketCols) {
      const cell = sheet.getCell(r, idx);
      // hyperlink-formatted cells expose the URL separately from display text
      const url = cell.hyperlink || (typeof cell.value === 'string' && cell.value.startsWith('http') ? cell.value : null);
      if (url) urls[key] = url.trim();
    }
    products.push({ productName: String(name).trim(), sku: String(sku).trim(), shopifyPrice, marketplaceUrls: urls });
  }
  return products;
}

/* ---------- scraping ---------- */

async function extractFromPage(page, cfg) {
  return page.evaluate((sel) => {
    const textOf = (s) => {
      if (!s) return null;
      const el = document.querySelector(s);
      return el ? el.textContent.trim() : null;
    };
    const out = {
      priceText: textOf(sel.price),
      originalText: sel.originalPrice ? textOf(sel.originalPrice) : null,
      discountText: sel.discount ? textOf(sel.discount) : null,
      priceFractionText: sel.priceFraction ? textOf(sel.priceFraction) : null,
      jsonLdPrice: null,
      bodySnippet: document.body ? document.body.innerText.slice(0, 3000) : '',
    };
    // JSON-LD fallback (Liverpool, VTEX sites embed Product schema)
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item && item['@type'] === 'Product' && item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            const p = offer.price ?? offer.lowPrice;
            if (p) { out.jsonLdPrice = String(p); break; }
          }
        }
      } catch (_) { /* ignore malformed blocks */ }
      if (out.jsonLdPrice) break;
    }
    return out;
  }, cfg.selector);
}

async function scrapeOne(page, marketplaceKey, url, shopifyPrice) {
  const cfg = MARKETPLACES[marketplaceKey];
  const result = { marketplace: marketplaceKey, url, status: 'ok', price: null, originalPrice: null, discount: null, errors: [] };

  try {
    // domcontentloaded instead of networkidle2: chatty sites (Liverpool, Sanborns,
    // Chedraui) never go network-idle and were timing out. waitForSelector below
    // handles the client-side render wait.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    try {
      await page.waitForSelector(cfg.selector.price, { timeout: SELECTOR_TIMEOUT });
    } catch (_) { /* fall through to JSON-LD fallback */ }

    const raw = await extractFromPage(page, cfg);

    // price
    let price = parseMoney(raw.priceText);
    if (price && raw.priceFractionText) { // Amazon whole+fraction
      const frac = parseInt(raw.priceFractionText.replace(/\D/g, ''), 10);
      if (Number.isFinite(frac)) price = Math.floor(price) + frac / 100;
    }
    if (!price) price = parseMoney(raw.jsonLdPrice);
    if (!price) {
      result.status = 'error';
      const body = (raw.bodySnippet || '').toLowerCase();
      if (body.includes('no está disponible') || body.includes('no esta disponible') || body.includes('agotado')) {
        result.errors.push('Listing unavailable (product/variant inactive on marketplace)');
      } else {
        result.errors.push('Could not extract price (selector empty and no JSON-LD) — check link or selector');
      }
      return result;
    }
    result.price = price;
    result.originalPrice = parseMoney(raw.originalText);

    // discount
    if (cfg.discountType === 'badge' && raw.discountText) {
      result.discount = parsePercent(raw.discountText);
    }
    if (result.discount == null && result.originalPrice && result.originalPrice > price) {
      result.discount = Math.round((1 - price / result.originalPrice) * 100);
    }
    if (result.discount == null) result.discount = 0;

    // Amazon: confirm our seller appears on the page
    if (cfg.requiresSellerSection && cfg.seller) {
      const found = raw.bodySnippet.toUpperCase().includes(cfg.seller.toUpperCase());
      if (!found) result.errors.push(`Seller "${cfg.seller}" not found on page`);
    }

    // validations
    if (shopifyPrice) {
      const expected = shopifyPrice / cfg.formula;
      result.expectedPrice = Math.round(expected * 100) / 100;
      const variance = Math.abs(price - expected) / expected;
      if (variance > THRESHOLDS.priceVariance) {
        result.errors.push(`Price mismatch: expected $${expected.toFixed(2)} (Shopify ${shopifyPrice} ÷ ${cfg.formula}), got $${price.toFixed(2)}`);
      }
    }
    if (result.discount <= THRESHOLDS.minDiscount) {
      result.errors.push(`No discount applied (${result.discount}%)`);
    }

    if (result.errors.length) result.status = 'alert';
    return result;
  } catch (err) {
    result.status = 'error';
    result.errors.push(`Navigation/scrape failed: ${err.message.split('\n')[0]}`);
    return result;
  }
}

/* ---------- output ---------- */

/**
 * Simple matrix, overwritten every day:
 * one row per SKU, one column per marketplace.
 * Cell format:  "$1,759 (-20%) ✓"   price correct, discount active
 *               "$1,850 (0%) ✗ SIN DESC"        no discount
 *               "$1,200 (-15%) ✗ PRECIO"        price off formula
 *               "✗ ERROR: <reason>"             link broken / not extractable
 */
function cellFor(r) {
  if (r.status === 'error') return `✗ ERROR: ${r.errors[0] || 'unknown'}`;
  const base = `$${r.price.toLocaleString('en-US')} (${r.discount > 0 ? '-' : ''}${r.discount}%)`;
  if (r.status === 'ok') return `${base} ✓`;
  const flags = [];
  if (r.errors.some((e) => e.startsWith('No discount'))) flags.push('SIN DESC');
  if (r.errors.some((e) => e.startsWith('Price mismatch'))) flags.push('PRECIO');
  if (r.errors.some((e) => e.startsWith('Seller'))) flags.push('VENDEDOR');
  return `${base} ✗ ${flags.join(', ') || 'REVISAR'}`;
}

async function writeResultsSheet(doc, results) {
  let sheet = doc.sheetsByTitle[RESULTS_SHEET];
  if (!sheet) sheet = await doc.addSheet({ title: RESULTS_SHEET });
  await sheet.clear();

  const marketNames = Object.values(MARKETPLACES).map((m) => m.name);
  const headers = ['Product', 'SKU', 'Shopify Price', ...marketNames, 'Updated'];
  await sheet.setHeaderRow(headers);

  const today = new Date().toISOString().slice(0, 10);
  const rows = results.map((product) => {
    const row = {
      'Product': product.productName,
      'SKU': product.sku,
      'Shopify Price': product.shopifyPrice ?? '',
      'Updated': today,
    };
    for (const [key, cfg] of Object.entries(MARKETPLACES)) {
      const r = product.marketplaces[key];
      row[cfg.name] = r ? cellFor(r) : '—'; // no URL in sheet for this marketplace
    }
    return row;
  });

  if (rows.length) await sheet.addRows(rows); // single batched call
  console.log(`📊 Wrote ${rows.length} product rows to "${RESULTS_SHEET}"`);
}

function writeLocalOutputs(results, alerts) {
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));

  let md = `# Marketplace alerts — ${new Date().toISOString().slice(0, 10)}\n\n`;
  if (!alerts.length) {
    md += 'No issues found. All products OK.\n';
  } else {
    for (const a of alerts) md += `- **${a.product}** (${a.sku}) — ${a.marketplace}: ${a.issues.join('; ')}\n`;
  }
  fs.writeFileSync(ALERTS_FILE, md);

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_alerts=${alerts.length > 0}\n`);
}

/* ---------- main ---------- */

(async () => {
  console.log('🚀 TETON marketplace monitor v2');
  const doc = await openDoc();
  const products = await loadProducts(doc);
  console.log(`✅ Loaded ${products.length} products from sheet`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=es-MX'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-MX,es;q=0.9' });
  // speed: skip images/media/fonts
  await page.setRequestInterception(true);
  page.on('request', (req) =>
    ['image', 'media', 'font'].includes(req.resourceType()) ? req.abort() : req.continue()
  );

  const results = [];
  const alerts = [];

  for (const product of products) {
    console.log(`\n📦 ${product.productName} (${product.sku})`);
    const entry = { ...product, marketplaces: {} };

    for (const [key, url] of Object.entries(product.marketplaceUrls)) {
      process.stdout.write(`  ${MARKETPLACES[key].name}... `);
      const r = await scrapeOne(page, key, url, product.shopifyPrice);
      entry.marketplaces[key] = r;
      console.log(r.status === 'ok' ? `✅ $${r.price} (-${r.discount}%)` : `⚠️ ${r.errors[0]}`);
      if (r.status !== 'ok') {
        alerts.push({ product: product.productName, sku: product.sku, marketplace: MARKETPLACES[key].name, issues: r.errors });
      }
      await new Promise((res) => setTimeout(res, 1500)); // be polite between requests
    }
    results.push(entry);
  }

  await browser.close();

  try {
    await writeResultsSheet(doc, results);
  } catch (err) {
    console.error('❌ Sheet write failed:', err.message);
  }
  writeLocalOutputs(results, alerts);

  console.log(`\n${alerts.length ? `⚠️ ${alerts.length} alert(s) — see data/alerts.md` : '✅ All OK'}`);
  // NOTE: always exit 0 — alerts are business signals, not build failures.
  // The workflow reads has_alerts output to decide whether to email.
})().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
