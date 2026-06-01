/**
 * MIS CUENTAS — Formato de moneda y números
 * Formato argentino: separador de miles con punto, decimales con coma, símbolo $.
 */

/**
 * Formatea un número como moneda argentina (ARS).
 * Ej: 1500000.5 → "$1.500.000,50" | 1500000 → "$1.500.000"
 * @param {number} value - Monto en pesos
 * @param {boolean} [showDecimals=false] - Mostrar centavos
 * @returns {string}
 */
export function formatARS(value, showDecimals = false) {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  const opts = {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  };
  // Usamos es-AR que formatea con punto como separador de miles y coma para decimales
  const formatted = Math.abs(value).toLocaleString('es-AR', opts);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${formatted}`;
}

/**
 * Formatea un número como dólares (USD).
 * Ej: 1200.5 → "US$1.200,50"
 * @param {number} value
 * @param {boolean} [showDecimals=true]
 * @returns {string}
 */
export function formatUSD(value, showDecimals = true) {
  if (value === null || value === undefined || isNaN(value)) return 'US$0';
  const opts = {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  };
  const formatted = Math.abs(value).toLocaleString('es-AR', opts);
  const sign = value < 0 ? '-' : '';
  return `${sign}US$${formatted}`;
}

/**
 * Formatea un porcentaje.
 * Ej: 30.5 → "30,5%" | 30 → "30%"
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '0%';
  return `${value.toLocaleString('es-AR', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: decimals 
  })}%`;
}

/**
 * Formatea el dólar CCL.
 * Ej: 1488.8 → "$1.488,80"
 * @param {number} value
 * @returns {string}
 */
export function formatDolar(value) {
  return formatARS(value, true);
}

/**
 * Parsea un string de moneda/número a número.
 * Acepta formatos: "1.500.000", "1500000", "$1.500", "1.500,50", etc.
 * @param {string} str
 * @returns {number}
 */
export function parseNumber(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return 0;
  
  // Remover símbolo de moneda y espacios
  let cleaned = str.replace(/[$\s]/g, '').replace(/US\$/gi, '').trim();
  
  if (!cleaned) return 0;
  
  // Detectar formato argentino (punto como miles, coma como decimal)
  // Si hay coma seguida de 1 o 2 dígitos al final, es decimal argentino
  const argentineMatch = cleaned.match(/^-?([\d.]+),(\d{1,2})$/);
  if (argentineMatch) {
    // Formato: 1.500.000,50
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Si tiene puntos pero no coma, son separadores de miles
    // Formato: 1.500.000
    if (cleaned.includes('.') && !cleaned.includes(',')) {
      // Verificar si es separador de miles (múltiples puntos) o decimal (un punto)
      const dots = cleaned.split('.').length - 1;
      if (dots > 1) {
        // Múltiples puntos → separador de miles
        cleaned = cleaned.replace(/\./g, '');
      } else {
        // Un solo punto: podría ser decimal o miles
        // Si después del punto hay 3 dígitos, probablemente es miles
        const afterDot = cleaned.split('.')[1];
        if (afterDot && afterDot.length === 3) {
          cleaned = cleaned.replace('.', '');
        }
        // Si no, dejarlo como decimal (formato internacional)
      }
    } else if (cleaned.includes(',')) {
      // Solo coma, puede ser decimal
      cleaned = cleaned.replace(',', '.');
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parsea un string de horas a número. 
 * Acepta: "96hs", "96", "96 hs", "9,5hs", "9.5hs", etc.
 * @param {string} str
 * @returns {number}
 */
export function parseHours(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = str.replace(/hs?/gi, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Formatea un número como horas.
 * @param {number} value
 * @returns {string}
 */
export function formatHours(value) {
  if (!value) return '—';
  // Mostrar con coma si tiene decimales
  const formatted = value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
  return `${formatted}hs`;
}

/**
 * Formatea fecha/hora legible en español.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
