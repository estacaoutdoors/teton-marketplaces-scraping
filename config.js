// Marketplace configuration
const MARKETPLACES = {
  liverpool: {
    name: 'Liverpool',
    column: 'Q',
    formula: 0.75,
    selector: {
      price: '.prices-container .price-info',
      discount: '.discount-badge'
    }
  },
  mercadolibre: {
    name: 'MercadoLibre',
    column: 'X',
    formula: 0.75,
    selector: {
      price: '.price-tag-fraction',
      discount: '.andes-badge'
    }
  },
  amazon: {
    name: 'Amazon',
    column: 'AC',
    formula: 0.85,
    seller: 'ESTACA OUTDOORS',
    selector: {
      price: '.a-price-whole',
      discount: '.a-badge-percent-off'
    },
    requiresSellerSection: true
  },
  coppel: {
    name: 'Coppel',
    column: 'AH',
    formula: 0.75,
    selector: {
      price: '.price',
      discount: '.discount'
    }
  },
  elektra: {
    name: 'Elektra',
    column: 'AO',
    formula: 0.75,
    selector: {
      price: '[class*="price"]',
      discount: '[class*="discount"]'
    }
  },
  walmart: {
    name: 'Walmart',
    column: 'AR',
    formula: 0.75,
    selector: {
      price: '[data-testid="current-price"]',
      discount: '[data-testid="discount-price"]'
    }
  },
  sears: {
    name: 'Sears',
    column: 'AW',
    formula: 0.75,
    selector: {
      price: '.price-now',
      discount: '.price-off'
    }
  },
  sanborns: {
    name: 'Sanborns',
    column: 'AX',
    formula: 0.75,
    selector: {
      price: '.product-price',
      discount: '.product-discount'
    }
  },
  marti: {
    name: 'Martí',
    column: 'BB',
    formula: 0.75,
    selector: {
      price: '.price-current',
      discount: '.discount-label'
    }
  },
  chedraui: {
    name: 'Chedraui',
    column: 'BH',
    formula: 0.75,
    selector: {
      price: '.product-price',
      discount: '.savings'
    }
  },
  lamarina: {
    name: 'La Marina',
    column: 'BN',
    formula: 0.75,
    selector: {
      price: '.current-price',
      discount: '.off-badge'
    }
  }
};

// Google Sheets configuration
const SHEETS_CONFIG = {
  spreadsheetId: '1Q-bbWzvY156Lcttj_vUfhHpqptXDsd3FUgX5tVTyGmo',
  tabName: '1ER CONTENEDOR',
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
  minDiscount: 0,
  priceVariance: 0.05
};

module.exports = {
  MARKETPLACES,
  SHEETS_CONFIG,
  THRESHOLDS
};
