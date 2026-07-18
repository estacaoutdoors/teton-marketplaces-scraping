# TETON Marketplace Scraper v2

Daily monitoring of TETON product prices and discounts across 11 Mexican marketplaces, with alerts when discounts are missing or prices break the formula.

## How it works

Every day at 6am UTC (12am CDMX), GitHub Actions:

1. Reads products and marketplace URLs live from the Google Sheet ("1ER CONTENEDOR" tab: A=product, B=SKU, C=Shopify price, URLs in columns Q–BN)
2. Opens each product URL in headless Chrome and extracts current price, original price, and discount %
3. Validates each price against the formula: Shopify ÷ 0.75 (Amazon: ÷ 0.85), 5% tolerance
4. Writes the full snapshot to the "Monitoring Results" tab of the sheet
5. Commits results.json + alerts.md to the repo (price history in git)
6. Emails jcsaucedo90@gmail.com ONLY if there are issues — quiet days send nothing

## Alert conditions

- No discount active (0%)
- Price deviates >5% from formula
- Price not extractable (broken link or site redesign)
- Amazon: ESTACA OUTDOORS not found on the listing

## Files

```
config.js                      # 11 marketplaces, verified selectors (see SELECTOR_REFERENCE.md)
scripts/scrape.js              # The scraper (Puppeteer + Google Sheets)
.github/workflows/scrape.yml   # Daily schedule + conditional emails
data/results.json              # Latest snapshot (committed daily)
data/alerts.md                 # Latest issues (email body)
SELECTOR_REFERENCE.md          # Per-marketplace selector documentation
SYSTEM_REVIEW.md               # v1 → v2 audit and changes
```

## Setup (already done)

GitHub Secrets required: `GOOGLE_SERVICE_ACCOUNT` (service account JSON, sheet shared with its client_email as Editor), `EMAIL_SERVER`, `EMAIL_PORT`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `EMAIL_FROM`.

## Run manually

GitHub → Actions → Daily Marketplace Scraper → Run workflow. Or locally:

```bash
npm install
# .env file with GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}
npm run scrape
```

## Maintenance

When a marketplace redesigns its site you'll get "Could not extract price" alerts for it. Open a product page on that site, find the new price/discount selectors (SELECTOR_REFERENCE.md documents the current ones and the method), and update that entry in config.js. The JSON-LD fallback usually keeps price extraction alive even when selectors break.
