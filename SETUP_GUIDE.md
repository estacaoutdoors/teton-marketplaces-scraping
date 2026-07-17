# TETON Marketplace Scraper - Setup Guide

Complete setup instructions in 5 steps.

## Step 1: Google Sheets API Setup (15 minutes)

### Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "TETON Marketplace Monitoring"
3. Enable Google Sheets API in APIs & Services

### Create Service Account
1. Go to Credentials
2. Create Service Account named `teton-marketplace-scraper`
3. Grant "Editor" role
4. Create JSON key and save it

### Share Sheet with Service Account
1. Open your Google Sheet
2. Copy the service account email from JSON key
3. Share sheet with that email (Editor access)

## Step 2: GitHub Secrets Configuration (5 minutes)

In your GitHub repo → Settings → Secrets → Actions, add:

### Required Secrets:
- **GOOGLE_SERVICE_ACCOUNT**: Paste entire JSON key from Step 1
- **EMAIL_SERVER**: smtp.gmail.com (or your mail server)
- **EMAIL_PORT**: 587 (for Gmail)
- **EMAIL_USERNAME**: your-email@gmail.com
- **EMAIL_PASSWORD**: Gmail app password (generate at myaccount.google.com → App passwords)
- **EMAIL_FROM**: your-email@gmail.com

## Step 3: Initial URL Fetch (One-time)

Local setup to extract URLs from your sheet:

```bash
npm install
export GOOGLE_SERVICE_ACCOUNT='{"type":"service_account",...}'  # Paste JSON
npm run fetch-urls
git add data/urls.json
git commit -m "chore: store marketplace URLs"
git push
```

## Step 4: Test the Scraper

### Local test:
```bash
npm run scrape
```

### GitHub Actions test:
Go to Actions → Daily Marketplace Scraper → Run workflow → main branch

## Step 5: Verify Everything Works

- Check GitHub Actions logs
- Review `data/results.json` in repo
- Verify email alerts arrive
- Check Google Sheet for results table

## Automated Schedule

Scraper now runs daily at 6am UTC (12am Mexico City time).

## Troubleshooting

**URLs file not found**: Run `npm run fetch-urls` again

**Sheet connection fails**: 
- Verify service account email is in Share list
- Check GOOGLE_SERVICE_ACCOUNT secret is set

**Marketplace scraper returns no prices**:
- Marketplace HTML may have changed
- Update CSS selectors in config.js

**Email not working**:
- For Gmail: Use app password, not account password
- Verify EMAIL_PORT is 587 (TLS)

## Customization

- **Change scrape time**: Edit `.github/workflows/scrape.yml` line 7
- **Adjust discount threshold**: Edit `config.js` line ~120
- **Update marketplace selectors**: Edit `config.js` MARKETPLACES section
