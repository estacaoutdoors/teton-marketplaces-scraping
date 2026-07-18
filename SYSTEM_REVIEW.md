# System Review — July 17, 2026

Full audit of the original (Haiku-built) system. 8 problems found, all fixed in v2.

## Bugs that would have broken the system

**1. Google Sheets auth was wrong (critical).**
`new GoogleSpreadsheet(id, credentialsJson)` is the v3 API. The installed library is v4, which requires a JWT client from google-auth-library. This is why you got "Invalid auth" when testing locally. Fixed in both the scraper and by removing fetch-urls.js.

**2. Price parsing corrupted every price above $999 (critical).**
Old code: `.replace(/,/g, '.')` → "$1,558.00" became `1.558.00` → parseFloat = **1.55 pesos**. Every price comparison for your products (all above $999) would have flagged false mismatches forever. v2 has a proper Mexican-format parser that also handles MercadoLibre's cents style ("$1,356,42").

**3. fetch-urls.js could never read your sheet (critical).**
It called `row.get('A')`, which looks up a header COLUMN NAMED "A" — your sheet has real header titles, so every row returned empty. v2 reads cells by position (row 2+, column A/B/C and the URL columns Q…BN) and also picks up hyperlink-formatted cells, which `row.get()` can't do.

**4. 7 of 11 sites render prices client-side (critical).**
Confirmed during live inspection: Coppel, Elektra, Sears, Sanborns, Martí, Chedraui and La Marina are React/VTEX apps; axios+cheerio receives an empty HTML shell. v2 uses Puppeteer (headless Chrome), which GitHub's ubuntu runners support out of the box.

**5. Discount regex grabbed the wrong number.**
`match(/(\d+)/)` on Coppel's "Ahorro $200 (22%)" returns **200**, not 22. v2 prefers the parenthesized percent, then plain "NN%", then computes from the two prices.

**6. Sheet update was never implemented.**
`updateSheet()` was a TODO stub — your core requirement (record price + discount % per marketplace) didn't exist. v2 writes a full snapshot to the "Monitoring Results" tab: Date, Product, SKU, Shopify Price, Marketplace, Expected Price, Price, Original Price, Discount %, Status, Issues. One batched write, not row-by-row.

**7. You would have received 2 emails every single day.**
The "report" email had `if: always()`, and the scraper exited with code 1 whenever alerts existed, marking the run failed and firing the failure email too. v2: alert email ONLY when issues exist (with the actual issue list in the body), failure email ONLY when the job itself crashes. Quiet days = no email.

**8. Stale two-step URL design.**
fetch-urls.js → data/urls.json → scraper meant edits to your sheet required manually re-running fetch-urls and committing. Pointless: the scraper already authenticates to the sheet. v2 reads URLs live on every run. urls.json and fetch-urls.js are deleted.

## Improvements added

- JSON-LD structured-data fallback: if a CSS selector breaks (sites redesign), price is recovered from the page's embedded Product schema (Liverpool and all VTEX sites have it).
- Images/fonts/media blocked during scraping → roughly 3x faster, less bandwidth.
- 1.5s delay between requests, es-MX locale headers, realistic user agent.
- results.json + alerts.md committed daily → price history lives in git.
- Amazon seller check now scans rendered page text for ESTACA OUTDOORS (old code looked for English "Also sold by" on a Spanish site).

## Files changed

| File | Action |
|------|--------|
| scripts/scrape.js | Rewritten (Puppeteer, JWT auth, correct parsing, sheet writing) |
| config.js | Rewritten earlier with 11 verified selector sets |
| package.json | axios, cheerio, nodemailer removed; puppeteer, google-auth-library added |
| .github/workflows/scrape.yml | Conditional emails, single dispatch, results+alerts committed |
| scripts/fetch-urls.js | DELETE from repo (obsolete) |
| scripts/scrape-enhanced.js | DELETE from repo (superseded duplicate) |
| data/urls.json | DELETE from repo (obsolete) |

## Known limitations (honest assessment)

- Amazon blocks datacenter IPs aggressively; the GitHub runner may get CAPTCHAs on Amazon specifically. If Amazon rows consistently error, the fix is a residential proxy (~$5-10/month) or accepting manual Amazon checks.
- Sears/Sanborns hashed class names (`stylesShopData_pPrice__jh4MT`) change on their redeploys; the `[class*=]` partial matching survives hash changes but not full renames. The JSON-LD fallback covers price if that happens, though the badge % would be lost (computed fallback kicks in when the original price is present).
- Sites change layouts without notice. When a selector dies you'll see "Could not extract price" alerts for that marketplace — that's the signal to re-inspect that one site, not a system failure.
