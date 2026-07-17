# TETON Marketplace Scraper

Automated daily monitoring of product prices and discounts across 11 Mexican marketplaces.

## Features

- ✅ Daily scraping at 6am UTC (via GitHub Actions)
- ✅ Price validation against Shopify formula (÷0.75 standard, ÷0.85 for Amazon)
- ✅ Discount percentage tracking
- ✅ Automatic alerts for missing discounts or price mismatches
- ✅ Color-coded results table in Google Sheet
- ✅ Email notifications (GitHub Actions + custom alerts)
- ✅ Amazon "Also sold by" section detection for ESTACA OUTDOORS

## Supported Marketplaces

| Marketplace | Column | Formula |
|------------|--------|---------|
| Liverpool | Q | Shopify ÷ 0.75 |
| MercadoLibre | X | Shopify ÷ 0.75 |
| Amazon | AC | Shopify ÷ 0.85 |
| Coppel | AH | Shopify ÷ 0.75 |
| Elektra | AO | Shopify ÷ 0.75 |
| Walmart | AR | Shopify ÷ 0.75 |
| Sears | AW | Shopify ÷ 0.75 |
| Sanborns | AX | Shopify ÷ 0.75 |
| Martí | BB | Shopify ÷ 0.75 |
| Chedraui | BH | Shopify ÷ 0.75 |
| La Marina | BN | Shopify ÷ 0.75 |

## Quick Start

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for complete setup instructions.

## File Structure

```
teton-marketplaces-scraping/
├── .github/workflows/
│   └── scrape.yml              # GitHub Actions workflow
├── scripts/
│   ├── scrape.js               # Main scraper logic
│   └── fetch-urls.js           # Initial URL fetcher
├── data/
│   ├── urls.json               # Product URLs (generated)
│   └── results.json            # Latest results
├── config.js                   # Configuration
├── package.json
├── README.md
├── SETUP_GUIDE.md
└── .gitignore
```

## Daily Workflow

1. **6am UTC**: GitHub Actions runs scraper
2. **Price extraction**: Checks Shopify formula compliance
3. **Discount check**: Alerts if no discount found
4. **Results update**: Stores JSON + updates Google Sheet
5. **Email alerts**: Sends summary to jcsaucedo90@gmail.com

## Support

For issues, check SETUP_GUIDE.md troubleshooting section.
