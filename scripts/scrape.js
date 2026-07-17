#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { MARKETPLACES, SHEETS_CONFIG, THRESHOLDS } = require('../config');

const URLS_FILE = path.join(__dirname, '../data/urls.json');
const RESULTS_FILE = path.join(__dirname, '../data/results.json');
const RESULTS_SHEET_NAME = 'Monitoring Results';

class MarketplaceScraper {
  constructor() {
    this.results = [];
    this.alerts = [];
    this.doc = null;
  }

  async initialize() {
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        this.doc = new GoogleSpreadsheet(SHEETS_CONFIG.spreadsheetId, credentials);
        await this.doc.loadInfo();
      }
    } catch (error) {
      console.warn('⚠️  Google Sheets not available:', error.message);
    }
  }

  async loadUrls() {
    try {
      const data = fs.readFileSync(URLS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load URLs from ${URLS_FILE}. Run 'npm run fetch-urls' first.`);
    }
  }

  async scrapeMarketplace(marketplace, url, shopifyPrice) {
    const config = MARKETPLACES[marketplace];
    const result = {
      marketplace,
      url,
      status: 'pending',
      errors: []
    };

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      let price = null;
      let discount = null;

      if (marketplace === 'amazon') {
        const pageText = $.text();
        if (!pageText.includes(config.seller)) {
          result.errors.push(`Not found in "Also sold by". Seller: ${config.seller}`);
          result.status = 'error';
          return result;
        }
        price = this.extractPrice($, '.a-price-whole');
        discount = this.extractDiscount($, '.a-badge-percent-off');
      } else {
        price = this.extractPrice($, config.selector.price);
        discount = this.extractDiscount($, config.selector.discount);
      }

      if (!price) {
        result.errors.push('Could not extract price from page');
        result.status = 'error';
        return result;
      }

      result.marketplacePrice = price;
      result.discount = discount || 0;

      const expectedPrice = shopifyPrice / config.formula;
      const variance = Math.abs(price - expectedPrice) / expectedPrice;

      if (variance > THRESHOLDS.priceVariance) {
        result.errors.push(
          `Price mismatch. Expected: ${expectedPrice.toFixed(2)}, Got: ${price.toFixed(2)}`
        );
      }

      if (discount <= THRESHOLDS.minDiscount) {
        result.errors.push(`No discount applied (${discount || 0}%)`);
      }

      result.status = result.errors.length === 0 ? 'ok' : 'error';
      return result;
    } catch (error) {
      result.errors.push(`Scrape error: ${error.message}`);
      result.status = 'error';
      return result;
    }
  }

  extractPrice(cheerioObj, selector) {
    let text = cheerioObj(selector).first().text().trim();
    text = text.replace(/[^\d.,]/g, '').replace(/,/g, '.');
    return parseFloat(text) || null;
  }

  extractDiscount(cheerioObj, selector) {
    let text = cheerioObj(selector).first().text().trim();
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async scrapeAllProducts(urls) {
    for (const product of urls) {
      console.log(`\n📦 Processing: ${product.productName} (SKU: ${product.sku})`);

      const productResults = {
        productName: product.productName,
        sku: product.sku,
        shopifyPrice: product.shopifyPrice,
        marketplaces: {},
        timestamp: new Date().toISOString()
      };

      for (const [marketplaceKey, url] of Object.entries(product.marketplaceUrls || {})) {
        if (!url) continue;

        console.log(`  🌐 ${MARKETPLACES[marketplaceKey].name}...`);
        const result = await this.scrapeMarketplace(marketplaceKey, url, product.shopifyPrice);
        productResults.marketplaces[marketplaceKey] = result;

        if (result.status === 'error') {
          this.alerts.push({
            product: product.productName,
            sku: product.sku,
            marketplace: MARKETPLACES[marketplaceKey].name,
            issues: result.errors
          });
        }
      }

      this.results.push(productResults);
    }
  }

  async updateSheet() {
    if (!this.doc) {
      console.log('⚠️  Skipping sheet update (Google Sheets not configured)');
      return;
    }

    try {
      let resultsSheet = this.doc.sheetsByTitle[RESULTS_SHEET_NAME];

      if (!resultsSheet) {
        console.log(`📊 Creating new sheet: ${RESULTS_SHEET_NAME}`);
        resultsSheet = await this.doc.addSheet({ title: RESULTS_SHEET_NAME });
      }

      const headers = ['Product', 'SKU', 'Shopify Price', ...Object.values(MARKETPLACES).map(m => m.name), 'Overall Status'];

      await resultsSheet.clear();
      await resultsSheet.setHeaderRow(headers);

      for (const result of this.results) {
        const row = {
          'Product': result.productName,
          'SKU': result.sku,
          'Shopify Price': result.shopifyPrice
        };

        for (const marketplace of Object.keys(MARKETPLACES)) {
          const marketplaceResult = result.marketplaces[marketplace];
          if (marketplaceResult) {
            row[MARKETPLACES[marketplace].name] =
              marketplaceResult.status === 'ok' ? '✅ OK' : '❌ ERROR';
          } else {
            row[MARKETPLACES[marketplace].name] = '-';
          }
        }

        const hasErrors = Object.values(result.marketplaces).some(m => m.status === 'error');
        row['Overall Status'] = hasErrors ? '❌ Issues' : '✅ OK';

        await resultsSheet.addRows([row]);
      }

      console.log('✅ Sheet updated with results');
    } catch (error) {
      console.error('❌ Sheet update failed:', error.message);
    }
  }

  saveResults() {
    const dir = path.dirname(RESULTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Results saved to ${RESULTS_FILE}`);
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('MARKETPLACE MONITORING REPORT');
    console.log('='.repeat(80));

    if (this.alerts.length === 0) {
      console.log('✅ All products OK - no issues found');
    } else {
      console.log(`⚠️  ${this.alerts.length} alert(s) found:\n`);
      for (const alert of this.alerts) {
        console.log(`📌 ${alert.product} (${alert.sku}) - ${alert.marketplace}`);
        alert.issues.forEach(issue => console.log(`   ❌ ${issue}`));
      }
    }

    console.log('\n' + '='.repeat(80));

    if (process.env.GITHUB_STEP_SUMMARY) {
      this.writeGitHubSummary();
    }
  }

  writeGitHubSummary() {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    let summary = '# 🛍️ Marketplace Monitoring Report\n\n';

    if (this.alerts.length === 0) {
      summary += '✅ **All products OK** - No issues detected.\n';
    } else {
      summary += `⚠️ **${this.alerts.length} Issue(s) Found**\n\n`;
      summary += '| Product | SKU | Marketplace | Issues |\n';
      summary += '|---------|-----|-------------|--------|\n';

      for (const alert of this.alerts) {
        const issues = alert.issues.join('; ');
        summary += `| ${alert.product} | ${alert.sku} | ${alert.marketplace} | ${issues} |\n`;
      }
    }

    fs.appendFileSync(summaryFile, summary);
  }

  async run() {
    try {
      console.log('🚀 Starting marketplace scraper...');
      await this.initialize();

      const urls = await this.loadUrls();
      console.log(`✅ Loaded URLs for ${urls.length} product(s)`);

      await this.scrapeAllProducts(urls);
      await this.updateSheet();
      this.saveResults();
      this.generateReport();

      if (this.alerts.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const scraper = new MarketplaceScraper();
  scraper.run();
}

module.exports = MarketplaceScraper;
