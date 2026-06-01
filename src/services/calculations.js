/**
 * MIS CUENTAS — Módulo de Cálculos Financieros
 * Implementa los 11 cálculos de la Sección 4 del spec.
 * REGLA: nunca devolver NaN, Infinity, ni #DIV/0!
 */

import { parseHours } from '../utils/format.js';

/**
 * División segura: si el divisor es 0 o inválido, devuelve 0.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
function safeDivide(numerator, denominator) {
  if (!denominator || !isFinite(denominator) || denominator === 0) return 0;
  if (!isFinite(numerator)) return 0;
  return numerator / denominator;
}

// ─── 1. INGRESOS USD ────────────────────────────────────
/**
 * Convierte ingresos ARS a USD.
 * @param {number} ingresosARS
 * @param {number} dolarCCL
 * @returns {number}
 */
export function calcIngresosUSD(ingresosARS, dolarCCL) {
  return safeDivide(ingresosARS, dolarCCL);
}

// ─── 2. TOTAL INGRESOS ──────────────────────────────────
/**
 * Calcula el total de ingresos (proyectado o real).
 * @param {Array} ingresos - Lista de ítems de ingreso
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcTotalIngresos(ingresos, modo = 'proyectado') {
  if (!ingresos || !Array.isArray(ingresos)) return 0;
  return ingresos.reduce((sum, item) => sum + (Number(item[modo]) || 0), 0);
}

// ─── 3. TOTAL EGRESOS ───────────────────────────────────
/**
 * Calcula el total de egresos de todas las categorías.
 * @param {Object} egresos - { catId: { items: [...] } }
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcTotalEgresos(egresos, modo = 'proyectado') {
  if (!egresos) return 0;
  let total = 0;
  for (const catId of Object.keys(egresos)) {
    total += calcSubtotalCategoria(egresos[catId], modo);
  }
  return total;
}

// ─── 4. SUBTOTAL POR CATEGORÍA ──────────────────────────
/**
 * Calcula el subtotal de una categoría de egreso.
 * @param {Object} categoria - { items: [...] }
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcSubtotalCategoria(categoria, modo = 'proyectado') {
  if (!categoria || !categoria.items) return 0;
  return categoria.items.reduce((sum, item) => sum + (Number(item[modo]) || 0), 0);
}

// ─── 5. RESTANTE MENSUAL ────────────────────────────────
/**
 * Calcula el restante del mes (Ingresos − Egresos).
 * @param {number} totalIngresos
 * @param {number} totalEgresos
 * @returns {{ ars: number, usd: number }}
 */
export function calcRestante(totalIngresos, totalEgresos, dolarCCL) {
  const ars = (totalIngresos || 0) - (totalEgresos || 0);
  return {
    ars,
    usd: safeDivide(ars, dolarCCL),
  };
}

// ─── 6. % REAL POR CATEGORÍA ────────────────────────────
/**
 * Calcula el porcentaje de una categoría sobre el total de egresos.
 * @param {number} subtotalCategoria
 * @param {number} totalEgresos
 * @returns {number} - Porcentaje (0-100)
 */
export function calcPorcentajeCategoria(subtotalCategoria, totalEgresos) {
  return safeDivide(subtotalCategoria, totalEgresos) * 100;
}

// ─── 7. COMPARACIÓN IDEAL vs REAL ───────────────────────
/**
 * Compara el % ideal con el % real ejecutado y devuelve un semáforo.
 * @param {number} percentIdeal - % objetivo (ej: 30)
 * @param {number} percentReal - % ejecutado (ej: 35)
 * @returns {'ok'|'warning'|'danger'}
 */
export function calcSemaforo(percentIdeal, percentReal) {
  if (percentIdeal === 0) {
    // Si ideal es 0%, cualquier gasto es una desviación
    return percentReal === 0 ? 'ok' : 'warning';
  }
  const ratio = safeDivide(percentReal, percentIdeal);
  if (ratio <= 1.05) return 'ok';        // Dentro del 5% de margen
  if (ratio <= 1.20) return 'warning';    // Entre 5% y 20% por encima
  return 'danger';                         // Más de 20% por encima
}

/**
 * Calcula la tabla de distribución ideal completa.
 * @param {Object} egresos - Datos de egresos del mes
 * @param {Object} distribucionIdeal - { catId: { nombre, percent } }
 * @param {'proyectado'|'real'} modo
 * @returns {Array<Object>}
 */
export function calcDistribucionIdeal(egresos, distribucionIdeal, modo = 'proyectado') {
  const totalEgresos = calcTotalEgresos(egresos, modo);
  
  return Object.entries(distribucionIdeal).map(([catId, config]) => {
    const subtotal = calcSubtotalCategoria(egresos[catId], modo);
    const percentReal = calcPorcentajeCategoria(subtotal, totalEgresos);
    const montoIdeal = safeDivide(config.percent * totalEgresos, 100);
    
    return {
      catId: Number(catId),
      nombre: config.nombre,
      percentIdeal: config.percent,
      montoProyectado: calcSubtotalCategoria(egresos[catId], 'proyectado'),
      montoReal: calcSubtotalCategoria(egresos[catId], 'real'),
      percentProyectado: calcPorcentajeCategoria(
        calcSubtotalCategoria(egresos[catId], 'proyectado'),
        calcTotalEgresos(egresos, 'proyectado')
      ),
      percentReal: calcPorcentajeCategoria(
        calcSubtotalCategoria(egresos[catId], 'real'),
        calcTotalEgresos(egresos, 'real')
      ),
      percentActual: percentReal,
      montoIdeal,
      semaforo: calcSemaforo(config.percent, percentReal),
    };
  });
}

// ─── 8. CARTERA: USD y % ────────────────────────────────
/**
 * Calcula los valores de la cartera.
 * @param {Object} portfolio - Datos de cartera
 * @param {number} dolarCCL
 * @returns {Object} - Cartera con valores calculados
 */
export function calcCartera(portfolio, dolarCCL) {
  if (!portfolio) return null;
  
  const result = { liquidez: {}, inversiones: {}, totals: {} };
  
  // Calcular cada línea de liquidez
  let totalLiquidezARS = 0;
  let totalLiquidezUSD = 0;
  
  for (const [key, item] of Object.entries(portfolio.liquidez || {})) {
    const montoOriginal = Number(item.monto) || 0;
    let ars, usd;
    
    if (item.moneda === 'USD') {
      usd = montoOriginal;
      ars = montoOriginal * dolarCCL;
    } else {
      ars = montoOriginal;
      usd = safeDivide(ars, dolarCCL);
    }
    
    result.liquidez[key] = { ...item, ars, usd, montoOriginal };
    totalLiquidezARS += ars;
    totalLiquidezUSD += usd;
  }
  
  // Calcular inversiones
  let totalInversionesARS = 0;
  let totalInversionesUSD = 0;
  
  for (const [key, item] of Object.entries(portfolio.inversiones || {})) {
    const montoOriginal = Number(item.monto) || 0;
    let ars, usd;
    
    if (item.moneda === 'USD') {
      usd = montoOriginal;
      ars = montoOriginal * dolarCCL;
    } else {
      ars = montoOriginal;
      usd = safeDivide(ars, dolarCCL);
    }
    
    result.inversiones[key] = { ...item, ars, usd, montoOriginal };
    totalInversionesARS += ars;
    totalInversionesUSD += usd;
  }
  
  // Gran total
  const granTotalARS = totalLiquidezARS + totalInversionesARS;
  const granTotalUSD = totalLiquidezUSD + totalInversionesUSD;
  
  // Calcular % del total para cada línea
  for (const key of Object.keys(result.liquidez)) {
    result.liquidez[key].percentTotal = safeDivide(result.liquidez[key].ars, granTotalARS) * 100;
  }
  for (const key of Object.keys(result.inversiones)) {
    result.inversiones[key].percentTotal = safeDivide(result.inversiones[key].ars, granTotalARS) * 100;
    result.inversiones[key].percentInversiones = safeDivide(
      result.inversiones[key].ars, totalInversionesARS
    ) * 100;
  }
  
  result.totals = {
    liquidezARS: totalLiquidezARS,
    liquidezUSD: totalLiquidezUSD,
    inversionesARS: totalInversionesARS,
    inversionesUSD: totalInversionesUSD,
    granTotalARS,
    granTotalUSD,
  };
  
  return result;
}

// ─── 9-10. TOTAL ANUAL Y PROMEDIO ───────────────────────
/**
 * Calcula el total anual de ingresos y promedio mensual.
 * @param {Array} meses - Array de 12 objetos de datos mensuales
 * @param {'proyectado'|'real'} modo
 * @returns {{ totalARS: number, totalUSD: number, promedioARS: number, promedioUSD: number, mesesConDatos: number }}
 */
export function calcTotalAnual(meses, modo = 'proyectado', dolarCCLActual) {
  let totalARS = 0;
  let totalUSD = 0;
  let mesesConDatos = 0;
  
  for (const mes of meses) {
    const ingreso = calcTotalIngresos(mes.ingresos, modo);
    if (ingreso > 0) {
      totalARS += ingreso;
      const dolar = mes.dolarCCL || dolarCCLActual || 1;
      totalUSD += safeDivide(ingreso, dolar);
      mesesConDatos++;
    }
  }
  
  return {
    totalARS,
    totalUSD,
    promedioARS: safeDivide(totalARS, mesesConDatos),
    promedioUSD: safeDivide(totalUSD, mesesConDatos),
    mesesConDatos,
  };
}

// ─── 11. SUMA DE HORAS ──────────────────────────────────
/**
 * Calcula la suma de horas mensuales de los ingresos.
 * @param {Array} ingresos
 * @returns {number}
 */
export function calcTotalHoras(ingresos) {
  if (!ingresos || !Array.isArray(ingresos)) return 0;
  return ingresos.reduce((sum, item) => {
    return sum + parseHours(item.horasMensuales);
  }, 0);
}

// ─── 12. TOP GASTOS DEL MES ─────────────────────────────
/**
 * Devuelve los N ítems con mayor gasto real del mes, con su categoría.
 * @param {Object} egresos - { catId: { items: [...] } }
 * @param {number} n - Cantidad de ítems a devolver
 * @param {Array} categorias - Array de categorías con nombre e ícono
 * @returns {Array<{ descripcion, real, catNombre, catIcon }>}
 */
export function calcTopGastos(egresos, n = 5, categorias = []) {
  if (!egresos) return [];
  const allItems = [];
  for (const [catId, cat] of Object.entries(egresos)) {
    if (!cat?.items) continue;
    const catInfo = categorias.find(c => c.id === Number(catId));
    for (const item of cat.items) {
      if ((item.real || 0) > 0) {
        allItems.push({
          descripcion: item.descripcion,
          real: item.real || 0,
          catNombre: catInfo?.nombre || `Cat ${catId}`,
          catIcon: catInfo?.icon || '📦',
        });
      }
    }
  }
  return allItems.sort((a, b) => b.real - a.real).slice(0, n);
}

// ─── 13. AHORRO ACUMULADO ───────────────────────────────
/**
 * Calcula el ahorro acumulado mes a mes (restante = ingresos − egresos).
 * @param {Array} meses - Array de 12 objetos de datos mensuales
 * @param {'proyectado'|'real'} modo
 * @param {number} dolarCCLActual
 * @returns {Array<{ mes: string, ahorroMes: number, acumulado: number, acumuladoUSD: number }>}
 */
export function calcAhorroAcumulado(meses, modo = 'real', dolarCCLActual = 1) {
  let acumulado = 0;
  const result = [];
  for (let i = 0; i < meses.length; i++) {
    const m = meses[i];
    if (!m) { result.push({ ahorroMes: 0, acumulado, acumuladoUSD: safeDivide(acumulado, dolarCCLActual) }); continue; }
    const ingresos = calcTotalIngresos(m.ingresos, modo);
    const egresos = calcTotalEgresos(m.egresos, modo);
    const ahorroMes = ingresos - egresos;
    acumulado += ahorroMes;
    const dolarMes = m.dolarCCL || dolarCCLActual;
    result.push({ ahorroMes, acumulado, acumuladoUSD: safeDivide(acumulado, dolarMes) });
  }
  return result;
}

// ─── 14. PROYECCIÓN DE FIN DE AÑO ──────────────────────
/**
 * Proyecta el resultado de fin de año según el promedio de los meses con datos.
 * @param {Array} meses
 * @param {'proyectado'|'real'} modo
 * @param {number} dolarCCL
 * @returns {{ totalActual: number, proyectado12: number, promedioMensual: number, mesesConDatos: number, proyectadoUSD: number }}
 */
export function calcProyeccionAnual(meses, modo = 'real', dolarCCL = 1) {
  let totalAhorro = 0;
  let mesesConDatos = 0;
  for (const m of meses) {
    if (!m) continue;
    const ing = calcTotalIngresos(m.ingresos, modo);
    const eg = calcTotalEgresos(m.egresos, modo);
    if (ing > 0 || eg > 0) {
      totalAhorro += (ing - eg);
      mesesConDatos++;
    }
  }
  const promedioMensual = safeDivide(totalAhorro, mesesConDatos);
  const proyectado12 = promedioMensual * 12;
  return {
    totalActual: totalAhorro,
    proyectado12,
    promedioMensual,
    mesesConDatos,
    proyectadoUSD: safeDivide(proyectado12, dolarCCL),
  };
}

// ─── 15. GASTO POR CATEGORÍA POR MES (TENDENCIA) ───────
/**
 * Para cada categoría, devuelve un array de 12 subtotales (uno por mes).
 * @param {Array} todosMeses - Array de 12 objetos de datos mensuales
 * @param {'proyectado'|'real'} modo
 * @returns {Object} - { catId: [val_ene, val_feb, ...] }
 */
export function calcTendenciaGastos(todosMeses, modo = 'real') {
  const result = {};
  for (let i = 0; i < todosMeses.length; i++) {
    const m = todosMeses[i];
    if (!m?.egresos) continue;
    for (const [catId, cat] of Object.entries(m.egresos)) {
      if (!result[catId]) result[catId] = new Array(12).fill(0);
      result[catId][i] = calcSubtotalCategoria(cat, modo);
    }
  }
  return result;
}

