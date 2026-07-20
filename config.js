// Marketplace configuration
// All selectors verified by live inspection of product pages on 2026-07-17
// discountType: 'badge' = site shows a % badge to extract; 'computed' = no badge, calculate from (1 - price/originalPrice)
const MARKETPLACES = {
  liverpool: {
    name: 'Liverpool',
    column: 'Q',
    formula: 0.75,
    // Verified on: /tienda/pdp/sleeping-bag-teton-lil-bridger-(/99973226041 → $1,759 / $2,198
    // data-testid attributes confirmed by JC from live page HTML 2026-07-20 (stable, preferred)
    selector: {
      price: '[data-testid="discounted"], span.text-feedback-error',   // current price; class as fallback
      originalPrice: '[data-testid="original"], span.line-through',    // compare-at price
      discount: null                                                    // no % badge on PDP
    },
    discountType: 'computed'
  },
  mercadolibre: {
    name: 'MercadoLibre',
    column: 'X', // "Link ML FULL" — per JC: monitor the FULL listing, not the main one (col U)
    formula: 0.75,
    // Verified on: MLM29821357 → $1,356.42 / $1,739 / "22% OFF"
    selector: {
      price: '.ui-pdp-price__second-line .andes-money-amount',
      originalPrice: 's.andes-money-amount--previous',
      discount: '.ui-pdp-price__second-line .andes-money-amount__discount'  // e.g. "22% OFF"
    },
    discountType: 'badge'
  },
  amazon: {
    name: 'Amazon',
    column: 'AC',
    formula: 0.85,
    seller: 'ESTACA OUTDOORS',
    // Verified on: /dp/B005EPRM4I → $1,772.87 / $1,914.03 / "-7%"
    selector: {
      price: '#corePriceDisplay_desktop_feature_div .a-price-whole',   // pair with .a-price-fraction
      priceFraction: '#corePriceDisplay_desktop_feature_div .a-price-fraction',
      originalPrice: '.basisPrice .a-offscreen',
      discount: '.savingsPercentage',                                   // e.g. "-7%"
      sellerLink: '#sellerProfileTriggerId'
    },
    discountType: 'badge',
    requiresSellerSection: true
  },
  coppel: {
    name: 'Coppel',
    column: 'AH',
    formula: 0.75,
    // Verified on: /pdp/...mkp-85341198 → $719 / $919 / "Ahorro $200 (22%)"
    selector: {
      price: '[data-testid="pdp_discounted_price"]',
      originalPrice: '[data-testid="pdp_price"]',
      discount: '[data-testid="pdp_savings_percentage"]'   // e.g. "Ahorro $200 (22%)" → extract number before %
    },
    discountType: 'badge'
  },
  elektra: {
    name: 'Elektra',
    column: 'AO',
    formula: 0.75,
    // Verified on: /bolsa-pdormir-sleppingbag-scout...-1300155251/p → $1,199 / $1,379 / "-13%"
    selector: {
      price: 'span.textPricePDP',
      originalPrice: 'span.textListPricePDP',
      discount: 'span.numbreDiscount'    // note: site's own typo "numbre", e.g. "-13%"
    },
    discountType: 'badge'
  },
  walmart: {
    name: 'Walmart',
    column: 'AR',
    formula: 0.75,
    // Verified on: /ip/...00750229612747 → $599.00 / $1,558.00 / "Ahorra $959.00"
    selector: {
      price: 'span[itemprop="price"]',                        // also [data-seo-id="hero-price"]
      originalPrice: '[data-seo-id="strike-through-price"]',
      discount: null                                          // only "Ahorra $X" text, no %
    },
    discountType: 'computed'
  },
  sears: {
    name: 'Sears',
    column: 'AW',
    formula: 0.75,
    // Verified on: /producto/600685/... → $830 MXN / $996 / "-16%"
    // CSS-module hashed classes — MUST use partial [class*=] matching
    selector: {
      price: '[class*="stylesShopData_pPrice"]',              // container; take first $ amount
      originalPrice: '[class*="stylesShopData_textUnderline"]',
      discount: '[class*="stylesDiscount_discount"]'          // e.g. "-16%"
    },
    discountType: 'badge'
  },
  sanborns: {
    name: 'Sanborns',
    column: 'AX',
    formula: 0.75,
    // Verified on: /producto/895081/... → $910 MXN / $1,300 MXN / "-30%"
    // Same platform as Sears, different hash prefix
    selector: {
      price: '[class*="stylesDataPrice_pPrice"]',             // container; take first $ amount
      originalPrice: '[class*="stylesDataPrice_textUnderline"]',
      discount: '[class*="stylesDataPrice_discount"]'         // e.g. "-30%"
    },
    discountType: 'badge'
  },
  marti: {
    name: 'Martí',
    column: 'BB',
    formula: 0.75,
    // Verified on: /tenis-nike-casual-1127886333/p → $1,070.40 / $1,799.00 / "-41%"
    selector: {
      price: '[class*="skuSelectorSellingPrice"]',
      originalPrice: '[class*="skuSelectorSellerListPrice"]',
      discount: '[class*="skuSelectorSellerSavings"]'         // e.g. "-41%"
    },
    discountType: 'badge'
  },
  chedraui: {
    name: 'Chedraui',
    column: 'BH',
    formula: 0.75,
    // Verified on: /tomate-saladet-por-kg-3102861/p → $14.90 / $24.00
    selector: {
      price: '[class*="simulatedSellingPrice"]',
      originalPrice: '[class*="simulatedListPrice"]',
      discount: null                                          // no % badge on PDP
    },
    discountType: 'computed'
  },
  lamarina: {
    name: 'La Marina',
    column: 'BN',
    formula: 0.75,
    // Verified on: /sleeping-lil-bridger...11014291/p (TETON, sold by ESTACA OUTDOORS) → $2,199 (no discount active)
    // Standard VTEX price components
    selector: {
      price: '.vtex-product-price-1-x-sellingPrice--pdp__selling-price',
      originalPrice: '.vtex-product-price-1-x-listPrice',
      discount: '.vtex-product-price-1-x-savingsPercentage'
    },
    discountType: 'badge'
  }
};

// IMPORTANT — rendering note (verified during inspection):
// Coppel, Sears, Sanborns, Martí, Chedraui, La Marina and Elektra render prices CLIENT-SIDE (React/VTEX).
// Plain axios+cheerio will get an empty shell on those sites.
// The scraper must use a headless browser (Puppeteer/Playwright) in GitHub Actions for reliable extraction.

// Google Sheets configuration
const SHEETS_CONFIG = {
  spreadsheetId: '1Q-bbWzvY156Lcttj_vUfhHpqptXDsd3FUgX5tVTyGmo',
  tabName: '1ER CONTENEDOR',
  // Verified against the real sheet 2026-07-17: A=PRODUCTO, B=SKU, K="Precio Shopify"
  shopifyPriceColumn: 'K',
  urlColumns: {
    productName: 'A',
    sku: 'B',
    ...Object.entries(MARKETPLACES).reduce((acc, [key, config]) => {
      acc[key] = config.column;
      return acc;
    }, {})
  }
};

// Alert thresholds
const THRESHOLDS = {
  minDiscount: 0, // Alert if discount is 0 (no discount)
  priceVariance: 0.05 // 5% variance allowed in price formula
};

module.exports = {
  MARKETPLACES,
  SHEETS_CONFIG,
  THRESHOLDS
};
