#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { SHEETS_CONFIG, MARKETPLACES } = require('../config');

const URLS_FILE = path.join(__dirname, '../data/urls.json');

class URLFetcher {
  constructor() {
    this.doc = null;
    this.products = [];
  }

  async initialize() {
    try {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT environment variable not set');
      }

      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      this.doc = new GoogleSpreadsheet(SHEETS_CONFIG.spreadsheetId, credentials);
      await this.doc.loadInfo();

      console.log(`✅ Connected to Google Sheets: ${this.doc.title}`);
    } catch (error) {
      throw new Error(`Failed to connect to Google Sheets: ${error.message}`);
    }
  }

  async fetchUrls() {
    try {
      const sheet = this.doc.sheetsByTitle[SHEETS_CONFIG.tabName];
      if (!sheet) {
        throw new Error(`Sheet "${SHEETS_CONFIG.tabName}" not found`);
      }

      await sheet.loadHeaderRow();
      const rows = await sheet.getRows();

      console.log(`\n📋 Reading ${rows.length} products from sheet...`);

      for (const row of rows) {
        const productName = row.get('A') || '';
        const sku = row.get('B') || '';

        if (!productName || !sku) continue;

        const shopifyPrice = parseFloat(row.get('C')) || 0;

        const product = {
          productName: productName.trim(),
          sku: sku.trim(),
          shopifyPrice,
          marketplaceUrls: {}
        };

        for (const [key, config] of Object.entries(MARKETPLACES)) {
          const url = row.get(config.column) || '';
          if (url && url.trim()) {
            product.marketplaceUrls[key] = url.trim();
          }
        }

        this.products.push(product);
        console.log(`  ✓ ${productName} (${sku}) - ${Object.keys(product.marketplaceUrls).length} marketplace links`);
      }

      console.log(`\n✅ Successfully fetched ${this.products.length} products`);
    } catch (error) {
      throw new Error(`Failed to fetch URLs: ${error.message}`);
    }
  }

  saveUrls() {
    const dir = path.dirname(URLS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(URLS_FILE, JSON.stringify(this.products, null, 2));
    console.log(`\n💾 URLs saved to ${URLS_FILE}`);
    console.log(`📌 You can now run 'npm run scrape' for daily monitoring`);
  }

  async run() {
    try {
      console.log('🔗 Fetching marketplace URLs from Google Sheets...\n');
      await this.initialize();
      await this.fetchUrls();
      this.saveUrls();
    } catch (error) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const fetcher = new URLFetcher();
  fetcher.run();
}

module.exports = URLFetcher;
