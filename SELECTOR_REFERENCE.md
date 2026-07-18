# Marketplace Selector Reference Table

All selectors verified by live inspection of real product pages on **July 17, 2026**.
Each row shows the exact product used for verification and the values read from the page at that moment.

| # | Marketplace | Current price selector | Original price selector | Discount % selector | Discount source | Verified product | Values confirmed |
|---|------------|------------------------|-------------------------|---------------------|-----------------|------------------|------------------|
| 1 | Liverpool | `span.text-feedback-error` | `span.line-through` | none | computed from prices | TETON Lil Bridger (99973226041, sold by Estaca Outdoors) | $1,759.00 / $2,198.00 → 20% |
| 2 | MercadoLibre | `.ui-pdp-price__second-line .andes-money-amount` | `s.andes-money-amount--previous` | `.ui-pdp-price__second-line .andes-money-amount__discount` | badge "22% OFF" | MLM29821357 sleeping bag | $1,356.42 / $1,739 → 22% |
| 3 | Amazon | `#corePriceDisplay_desktop_feature_div .a-price-whole` (+ `.a-price-fraction`) | `.basisPrice .a-offscreen` | `.savingsPercentage` | badge "-7%" | TETON Celsius Regular -18C (B005EPRM4I) | $1,772.87 / $1,914.03 → -7% |
| 4 | Coppel | `[data-testid="pdp_discounted_price"]` | `[data-testid="pdp_price"]` | `[data-testid="pdp_savings_percentage"]` | badge "Ahorro $200 (22%)" | Bolsa Eo Safe Imports ESI-20153 (mkp-85341198) | $719 / $919 → 22% |
| 5 | Elektra | `span.textPricePDP` | `span.textListPricePDP` | `span.numbreDiscount` | badge "-13%" | Coleman Scout (1300155251) | $1,199 / $1,379 → -13% |
| 6 | Walmart | `span[itemprop="price"]` (also `[data-seo-id="hero-price"]`) | `[data-seo-id="strike-through-price"]` | none | computed ("Ahorra $959.00" only) | Ilios Innova saco (00750229612747) | $599.00 / $1,558.00 → 62% |
| 7 | Sears | `[class*="stylesShopData_pPrice"]` (container, first $ amount) | `[class*="stylesShopData_textUnderline"]` | `[class*="stylesDiscount_discount"]` | badge "-16%" | Wenzel Summer Camp 40 (600685) | $830 MXN / $996 → -16% |
| 8 | Sanborns | `[class*="stylesDataPrice_pPrice"]` (container, first $ amount) | `[class*="stylesDataPrice_textUnderline"]` | `[class*="stylesDataPrice_discount"]` | badge "-30%" | Bolsa Compacta Verde (895081) | $910 MXN / $1,300 MXN → -30% |
| 9 | Martí | `[class*="skuSelectorSellingPrice"]` | `[class*="skuSelectorSellerListPrice"]` | `[class*="skuSelectorSellerSavings"]` | badge "-41%" | Nike Court Vision (1127886333) — no sleeping bags listed | $1,070.40 / $1,799.00 → -41% |
| 10 | Chedraui | `[class*="simulatedSellingPrice"]` | `[class*="simulatedListPrice"]` | none | computed from prices | Tomate Saladet (3102861) — no sleeping bags in search | $14.90/kg / $24.00/kg → 38% |
| 11 | La Marina | `.vtex-product-price-1-x-sellingPrice--pdp__selling-price` | `.vtex-product-price-1-x-listPrice` | `.vtex-product-price-1-x-savingsPercentage` | badge (VTEX standard) | TETON Lil Bridger (11014291, sold by ESTACA OUTDOORS) | $2,199 — no discount active |

## Notes per marketplace

1. **Liverpool** — Red price = current, struck-through = original. When no discount, only one price shows (no `.line-through` element). "Vendido por: Estaca Outdoors" link: `a[href*="estaca-outdoors"]`.
2. **MercadoLibre** — Careful: `.andes-money-amount` appears dozens of times (related products). Always scope to `.ui-pdp-price__second-line` for current price. Cents use superscript format ("$1,356,42").
3. **Amazon** — Seller name link: `#sellerProfileTriggerId`. "Also sold by" check for ESTACA OUTDOORS still applies. Price split into whole + fraction spans. Alternate single-string source: `.aok-offscreen` ("$1,772.87 con un ahorro del 7%").
4. **Coppel** — Cleanest site: stable `data-testid` attributes. Extract % from "Ahorro $200 (22%)" with regex `\((\d+)%\)`. A postal-code modal appears on first visit; scraping via HTTP won't see it, headless browser must dismiss it.
5. **Elektra** — Class name has the site's own typo: `numbreDiscount`. VTEX platform, search URL format: `/term?_q=term&map=ft`.
6. **Walmart** — `itemprop="price"` is a microdata attribute, very stable. No % badge, only "Ahorra $X"; compute % as (1 − price/original) × 100.
7. **Sears** — CSS-module hashed classes (`stylesShopData_pPrice__jh4MT`). Hash suffix changes on redeploys; ALWAYS use `[class*=]` partial matching. Direct search URLs error out; product URLs work: `/producto/{id}/{slug}`.
8. **Sanborns** — Same Grupo Sanborns platform as Sears but different module prefix (`stylesDataPrice` vs `stylesShopData`). Same caveats.
9. **Martí** — VTEX. No sleeping bags in catalog as of verification; PDP structure verified on footwear (structure is identical site-wide). Multiple discount badges can coexist (-30% and -15% promo chips); the total is `skuSelectorSellerSavings` (-41%).
10. **Chedraui** — VTEX with custom "products-simulator" price components. Search found no sleeping bags; structure verified on grocery PDP (identical site-wide). Also, no result page returns suggestions — scraper must verify the PDP URL didn't redirect.
11. **La Marina** — Standard VTEX price block. TETON products confirmed present, sold by ESTACA OUTDOORS. Use the `--pdp__selling-price` modifier to avoid matching carousel prices ($2,665, $2,265... from related products).

## Critical finding: client-side rendering

During inspection, these sites rendered prices with JavaScript AFTER page load: **Coppel, Elektra, Sears, Sanborns, Martí, Chedraui, La Marina** (React/VTEX SPAs). Sears even shows "Application error" on direct URL hits without a browser.

This means the current `axios + cheerio` scraper will get empty HTML shells from 7 of 11 sites. The GitHub Actions workflow needs **Puppeteer (headless Chrome)** to render pages before extracting. Liverpool, MercadoLibre, Amazon and Walmart ship prices in the initial HTML and may work with plain HTTP, but Amazon aggressively blocks datacenter IPs, so Puppeteer with stealth settings is the safer choice for all 11.

## Discount math convention

For "computed" sites: `discount % = round((1 - currentPrice / originalPrice) × 100)`.
If no `originalPrice` element exists on the page, the product has NO active discount → triggers the no-discount alert.
