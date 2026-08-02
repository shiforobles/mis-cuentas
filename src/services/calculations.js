/**
 * MIS CUENTAS — Módulo de Cálculos Financieros
 * Implementa los 11 cálculos de la Sección 4 del spec.
 * REGLA: nunca devolver NaN, Infinity, ni #DIV/0!
 */

import { parseHours } from '../utils/format.js';
import { CATEGORIAS_EGRESO, esMedioTarjeta, MEDIO_PAGO_DEFAULT, esIngresoPasivo } from '../utils/constants.js';

/** IDs de categorías que NO son gasto: capital o pago de tarjeta (ver constants.js). */
const TRANSFERENCIA_IDS = new Set(
  CATEGORIAS_EGRESO.filter(c => c.esTransferencia).map(c => c.id)
);

/** IDs de categorías de inversión / movimiento de capital. */
const CAPITAL_IDS = new Set(
  CATEGORIAS_EGRESO.filter(c => c.tipoTransferencia === 'capital').map(c => c.id)
);

/** IDs de categorías de pago de resumen de tarjeta. */
const PAGO_TARJETA_IDS = new Set(
  CATEGORIAS_EGRESO.filter(c => c.tipoTransferencia === 'pago_tarjeta').map(c => c.id)
);

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

/**
 * Separa los ingresos entre trabajo y renta de la cartera (dividendos, cupones,
 * intereses). La renta pasiva es la que mide el progreso hacia la independencia
 * financiera: cuánto entra sin poner horas.
 *
 * @param {Array} ingresos
 * @param {'proyectado'|'real'} modo
 * @returns {{ trabajo:number, pasivo:number, total:number, pctPasivo:number, itemsPasivos:Array }}
 */
export function calcIngresosPorOrigen(ingresos, modo = 'real') {
  let trabajo = 0;
  let pasivo = 0;
  const itemsPasivos = [];
  for (const item of ingresos || []) {
    const monto = Number(item?.[modo]) || 0;
    if (esIngresoPasivo(item?.descripcion)) {
      pasivo += monto;
      if (monto > 0) itemsPasivos.push({ descripcion: item.descripcion, monto });
    } else {
      trabajo += monto;
    }
  }
  const total = trabajo + pasivo;
  return { trabajo, pasivo, total, pctPasivo: safeDivide(pasivo, total) * 100, itemsPasivos };
}

/**
 * Renta pasiva anual y su rendimiento sobre la cartera invertida.
 * Responde: "¿cuánto me paga por año lo que tengo invertido?".
 *
 * @param {Array} meses - documentos de mes del año
 * @param {number} carteraInversionesARS - total invertido (de calcCartera)
 * @param {'proyectado'|'real'} modo
 * @returns {{ totalAnual:number, promedioMensual:number, mesesConRenta:number, yieldAnual:number, proyeccionAnual:number }}
 */
export function calcRentaPasiva(meses, carteraInversionesARS = 0, modo = 'real') {
  let totalAnual = 0;
  let mesesConRenta = 0;
  let mesesTranscurridos = 0;
  for (const m of meses || []) {
    if (!m) continue;
    const { pasivo, total } = calcIngresosPorOrigen(m.ingresos, modo);
    if (total > 0) mesesTranscurridos++;
    if (pasivo > 0) { totalAnual += pasivo; mesesConRenta++; }
  }
  const promedioMensual = safeDivide(totalAnual, mesesTranscurridos || mesesConRenta);
  const proyeccionAnual = promedioMensual * 12;
  return {
    totalAnual,
    promedioMensual,
    mesesConRenta,
    proyeccionAnual,
    yieldAnual: safeDivide(proyeccionAnual, carteraInversionesARS) * 100,
  };
}

// ─── 3. TOTAL EGRESOS ───────────────────────────────────
/**
 * Calcula el total de egresos de todas las categorías.
 * Excluye las categorías marcadas como movimiento de capital (ej: Inversión):
 * no son gasto, solo cambian la plata de forma (ver calcTotalMovimientosCapital).
 * @param {Object} egresos - { catId: { items: [...] } }
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcTotalEgresos(egresos, modo = 'proyectado') {
  if (!egresos) return 0;
  let total = 0;
  for (const catId of Object.keys(egresos)) {
    if (TRANSFERENCIA_IDS.has(Number(catId))) continue;
    total += calcSubtotalCategoria(egresos[catId], modo);
  }
  return total;
}

/**
 * Calcula el total de movimientos de capital del mes (ej: Inversión).
 * Es la contraparte de calcTotalEgresos: suma SOLO las categorías marcadas
 * como transferencia, para mostrarlas aparte sin que se pierdan.
 * @param {Object} egresos - { catId: { items: [...] } }
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcTotalMovimientosCapital(egresos, modo = 'proyectado') {
  if (!egresos) return 0;
  let total = 0;
  for (const catId of Object.keys(egresos)) {
    if (!CAPITAL_IDS.has(Number(catId))) continue;
    total += calcSubtotalCategoria(egresos[catId], modo);
  }
  return total;
}

/**
 * Total pagado de resúmenes de tarjeta en el mes. No es gasto (los consumos ya
 * se registraron en su rubro): es la cancelación del pasivo de la tarjeta.
 * @param {Object} egresos
 * @param {'proyectado'|'real'} modo
 * @returns {number}
 */
export function calcTotalPagosTarjeta(egresos, modo = 'proyectado') {
  if (!egresos) return 0;
  let total = 0;
  for (const catId of Object.keys(egresos)) {
    if (!PAGO_TARJETA_IDS.has(Number(catId))) continue;
    total += calcSubtotalCategoria(egresos[catId], modo);
  }
  return total;
}

/**
 * Consumos con tarjeta de crédito en el mes, a partir de las transacciones
 * (cada una declara su `medioPago`). Es la contraparte de los pagos de resumen:
 * lo consumido este mes se paga en el resumen del mes siguiente.
 *
 * Excluye las transacciones de categorías que no son gasto (inversión y el
 * propio pago de tarjeta) para no mezclar conceptos.
 *
 * @param {Array} transacciones - transacciones del mes
 * @returns {{ total: number, porTarjeta: Object<string, number> }}
 */
export function calcConsumosTarjeta(transacciones) {
  const porTarjeta = {};
  let total = 0;
  for (const t of transacciones || []) {
    if (t?.type !== 'egreso') continue;
    if (TRANSFERENCIA_IDS.has(Number(t.categoryId))) continue;
    const medio = t.medioPago || MEDIO_PAGO_DEFAULT;
    if (!esMedioTarjeta(medio)) continue;
    const monto = Number(t.amount) || 0;
    porTarjeta[medio] = (porTarjeta[medio] || 0) + monto;
    total += monto;
  }
  return { total, porTarjeta };
}

/**
 * Desglose de salidas de plata por medio de pago. A diferencia de
 * calcConsumosTarjeta, acá SÍ entran las transferencias (invertir o pagar el
 * resumen también saca plata de la billetera): el objetivo es poder contrastar
 * el total contra el resumen real de la cuenta — el arqueo que permite
 * detectar gastos sin registrar.
 *
 * @param {Array} transacciones - transacciones del mes
 * @returns {{ total:number, porMedio:Array<{medio,total,cantidad,esTarjeta}>, sinMedio:{total:number,cantidad:number} }}
 */
export function calcGastosPorMedioPago(transacciones) {
  const acc = new Map();
  let total = 0;
  const sinMedio = { total: 0, cantidad: 0 };

  for (const t of transacciones || []) {
    if (t?.type !== 'egreso') continue;
    const monto = Number(t.amount) || 0;
    if (!t.medioPago) { sinMedio.total += monto; sinMedio.cantidad++; }
    const medio = t.medioPago || MEDIO_PAGO_DEFAULT;
    if (!acc.has(medio)) acc.set(medio, { medio, total: 0, cantidad: 0, esTarjeta: esMedioTarjeta(medio) });
    const e = acc.get(medio);
    e.total += monto;
    e.cantidad++;
    total += monto;
  }

  return {
    total,
    porMedio: [...acc.values()].sort((a, b) => b.total - a.total),
    sinMedio,
  };
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
 *
 * BASE DE CÁLCULO: los porcentajes se miden sobre los INGRESOS del mes, no
 * sobre los egresos. Es la lógica del método 50/30/20: "30% de lo que ganás va
 * a vivienda", no "30% de lo que gastás". Medir sobre egresos tenía dos
 * problemas: (1) un mes de poco gasto inflaba artificialmente todos los
 * rubros, y (2) como las categorías de transferencia (inversión, pago de
 * tarjeta) se excluyen del total, los porcentajes reales se repartían sobre
 * una base del 100% mientras los ideales visibles sumaban menos, marcando
 * "excedido" de forma sistemática.
 *
 * Con base ingresos, la fila de ahorro/inversión también tiene sentido y el
 * conjunto cierra: gastos + inversión + no asignado = 100% de lo que entró.
 *
 * Si no hay ingresos cargados en el mes, cae a la base anterior (egresos) para
 * no mostrar todo en 0.
 *
 * @param {Object} egresos - Datos de egresos del mes
 * @param {Object} distribucionIdeal - { catId: { nombre, percent } }
 * @param {'proyectado'|'real'} modo
 * @param {Array} [ingresos] - ítems de ingreso del mes (base de cálculo)
 * @returns {Array<Object>}
 */
export function calcDistribucionIdeal(egresos, distribucionIdeal, modo = 'proyectado', ingresos = null) {
  // Base de cada modo: ingresos del mes; si no hay, egresos (comportamiento viejo).
  const baseDe = (m) => {
    const ing = ingresos ? calcTotalIngresos(ingresos, m) : 0;
    return ing > 0 ? ing : calcTotalEgresos(egresos, m);
  };
  const base = baseDe(modo);
  const baseProy = baseDe('proyectado');
  const baseReal = baseDe('real');
  const sobreIngresos = Boolean(ingresos && calcTotalIngresos(ingresos, modo) > 0);

  return Object.entries(distribucionIdeal)
    .filter(([catId]) => !PAGO_TARJETA_IDS.has(Number(catId)))
    .map(([catId, config]) => {
    const subtotal = calcSubtotalCategoria(egresos[catId], modo);
    const percentReal = calcPorcentajeCategoria(subtotal, base);
    const montoIdeal = safeDivide(config.percent * base, 100);

    return {
      catId: Number(catId),
      nombre: config.nombre,
      percentIdeal: config.percent,
      esInversion: CAPITAL_IDS.has(Number(catId)),
      montoProyectado: calcSubtotalCategoria(egresos[catId], 'proyectado'),
      montoReal: calcSubtotalCategoria(egresos[catId], 'real'),
      percentProyectado: calcPorcentajeCategoria(
        calcSubtotalCategoria(egresos[catId], 'proyectado'),
        baseProy
      ),
      percentReal: calcPorcentajeCategoria(
        calcSubtotalCategoria(egresos[catId], 'real'),
        baseReal
      ),
      percentActual: percentReal,
      montoIdeal,
      base,
      sobreIngresos,
      // En inversión/ahorro, quedarse CORTO es lo malo (no pasarse).
      semaforo: CAPITAL_IDS.has(Number(catId))
        ? calcSemaforoAhorro(config.percent, percentReal)
        : calcSemaforo(config.percent, percentReal),
    };
  });
}

/**
 * Semáforo invertido para ahorro/inversión: acá el objetivo es un MÍNIMO.
 * Superarlo está bien; quedarse corto es lo que hay que marcar.
 * @param {number} percentIdeal
 * @param {number} percentReal
 * @returns {'ok'|'warning'|'danger'}
 */
export function calcSemaforoAhorro(percentIdeal, percentReal) {
  if (percentIdeal === 0) return 'ok';
  const ratio = safeDivide(percentReal, percentIdeal);
  if (ratio >= 0.95) return 'ok';      // llegó al objetivo (5% de tolerancia)
  if (ratio >= 0.6) return 'warning';  // a mitad de camino
  return 'danger';                      // muy por debajo
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

  // Exposición por moneda (valor en ARS de lo denominado en cada moneda).
  let exposicionARS = 0; // valor de holdings en pesos
  let exposicionUSD = 0; // valor (en ARS) de holdings en dólares

  // Calcular cada línea de liquidez
  let totalLiquidezARS = 0;
  let totalLiquidezUSD = 0;

  for (const [key, item] of Object.entries(portfolio.liquidez || {})) {
    const montoOriginal = Number(item.monto) || 0;
    let ars, usd;

    if (item.moneda === 'USD') {
      usd = montoOriginal;
      ars = montoOriginal * dolarCCL;
      exposicionUSD += ars;
    } else {
      ars = montoOriginal;
      usd = safeDivide(ars, dolarCCL);
      exposicionARS += ars;
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
      exposicionUSD += ars;
    } else {
      ars = montoOriginal;
      usd = safeDivide(ars, dolarCCL);
      exposicionARS += ars;
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
    exposicionARS,
    exposicionUSD,
  };

  return result;
}

/** Umbral de desvío (en puntos porcentuales) para disparar la alerta de rebalanceo. */
export const REBALANCE_THRESHOLD_PP = 5;

/** Meses de gastos objetivo para el fondo de emergencia. */
export const EMERGENCIA_MESES_OBJETIVO = 3;

/**
 * Promedio de gasto mensual a partir de los meses con datos.
 * Usa egresos reales si hay; si no, cae a proyectado.
 * @param {Array} meses - array de documentos de mes (puede tener nulls)
 * @returns {{ promedioARS: number, modo: 'real'|'proyectado', mesesConDatos: number }}
 */
export function calcGastoMensualPromedio(meses) {
  let sumReal = 0, nReal = 0, sumProy = 0, nProy = 0;
  for (const m of meses || []) {
    if (!m) continue;
    const real = calcTotalEgresos(m.egresos, 'real');
    const proy = calcTotalEgresos(m.egresos, 'proyectado');
    if (real > 0) { sumReal += real; nReal++; }
    if (proy > 0) { sumProy += proy; nProy++; }
  }
  if (nReal > 0) return { promedioARS: sumReal / nReal, modo: 'real', mesesConDatos: nReal };
  if (nProy > 0) return { promedioARS: sumProy / nProy, modo: 'proyectado', mesesConDatos: nProy };
  return { promedioARS: 0, modo: 'real', mesesConDatos: 0 };
}

/**
 * Calcula la cobertura del fondo de emergencia en meses de gasto.
 * El concepto se identifica por `portfolio.emergenciaKey` dentro de liquidez.
 * @param {object} portfolio
 * @param {Array} meses
 * @param {number} dolarCCL
 * @returns {object|null}
 */
export function calcFondoEmergencia(portfolio, meses, dolarCCL) {
  if (!portfolio) return null;
  const key = portfolio.emergenciaKey;
  const item = key ? portfolio.liquidez?.[key] : null;
  if (!item) return { configurado: false };

  const montoOriginal = Number(item.monto) || 0;
  const fondoARS = item.moneda === 'USD' ? montoOriginal * dolarCCL : montoOriginal;
  const fondoUSD = item.moneda === 'USD' ? montoOriginal : safeDivide(fondoARS, dolarCCL);

  const gasto = calcGastoMensualPromedio(meses);
  const mesesCubiertos = gasto.promedioARS > 0 ? fondoARS / gasto.promedioARS : null;
  const objetivoMeses = EMERGENCIA_MESES_OBJETIVO;
  const objetivoARS = gasto.promedioARS * objetivoMeses;
  const faltanteARS = Math.max(0, objetivoARS - fondoARS);

  return {
    configurado: true,
    label: item.label,
    fondoARS,
    fondoUSD,
    gastoMensualARS: gasto.promedioARS,
    gastoModo: gasto.modo,
    mesesConDatos: gasto.mesesConDatos,
    mesesCubiertos,
    objetivoMeses,
    objetivoARS,
    faltanteARS,
    alcanza: mesesCubiertos != null && mesesCubiertos >= objetivoMeses,
  };
}

/** Objetivos por defecto si la cartera no tiene `targets` configurados. */
export const TARGETS_DEFAULT = { liquidezPct: 30, usdPct: 50 };

/**
 * Compara la asignación actual de la cartera contra los objetivos y
 * calcula desvíos y montos a mover para rebalancear.
 *
 * Dos dimensiones independientes:
 *  - bloque: Liquidez vs Inversiones (sobre el gran total)
 *  - moneda: ARS vs USD (exposición, sobre el gran total)
 *
 * @param {object} totals - result.totals de calcCartera
 * @param {{ liquidezPct?: number, usdPct?: number }} targets
 * @param {number} dolarCCL - para expresar el ajuste también en USD
 * @returns {object|null}
 */
export function calcRebalanceo(totals, targets, dolarCCL) {
  if (!totals) return null;
  const gt = totals.granTotalARS || 0;
  if (gt <= 0) return null;

  const t = { ...TARGETS_DEFAULT, ...(targets || {}) };
  const clamp = (v, def) => {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(100, Math.max(0, n));
  };

  const buildDim = (curAARS, curBARS, tgtAPct, labelA, labelB) => {
    const curAPct = (curAARS / gt) * 100;
    const curBPct = (curBARS / gt) * 100;
    const tgtA = clamp(tgtAPct, 50);
    const tgtB = 100 - tgtA;
    const devPp = curAPct - tgtA; // + = exceso en A, faltante en B
    const ajusteARS = (Math.abs(devPp) / 100) * gt;
    return {
      a: { label: labelA, curPct: curAPct, tgtPct: tgtA, curARS: curAARS },
      b: { label: labelB, curPct: curBPct, tgtPct: tgtB, curARS: curBARS },
      devPp,
      alerta: Math.abs(devPp) >= REBALANCE_THRESHOLD_PP,
      // Lado con exceso → mover hacia el otro
      origen: devPp > 0 ? labelA : labelB,
      destino: devPp > 0 ? labelB : labelA,
      ajusteARS,
      ajusteUSD: safeDivide(ajusteARS, dolarCCL),
    };
  };

  return {
    threshold: REBALANCE_THRESHOLD_PP,
    bloque: buildDim(totals.liquidezARS, totals.inversionesARS, t.liquidezPct, 'Liquidez', 'Inversiones'),
    moneda: buildDim(totals.exposicionUSD, totals.exposicionARS, t.usdPct, 'USD', 'ARS'),
  };
}

// ─── 9-10. TOTAL ANUAL Y PROMEDIO ───────────────────────
/**
 * Calcula el total anual de ingresos y promedio mensual.
 * @param {Array} meses - Array de 12 objetos de datos mensuales
 * @param {'proyectado'|'real'} modo
 * @param {number} dolarCCLActual
 * @param {number[]} [dolaresPorMes] - dólar resuelto de cada mes (mismo índice
 *   que meses); tiene prioridad sobre el campo crudo mes.dolarCCL.
 * @returns {{ totalARS: number, totalUSD: number, promedioARS: number, promedioUSD: number, mesesConDatos: number }}
 */
export function calcTotalAnual(meses, modo = 'proyectado', dolarCCLActual, dolaresPorMes = null) {
  let totalARS = 0;
  let totalUSD = 0;
  let mesesConDatos = 0;

  for (let i = 0; i < meses.length; i++) {
    const mes = meses[i];
    if (!mes) continue;
    const ingreso = calcTotalIngresos(mes.ingresos, modo);
    if (ingreso > 0) {
      totalARS += ingreso;
      const dolar = dolaresPorMes?.[i] || mes.dolarCCL || dolarCCLActual || 1;
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
    if (TRANSFERENCIA_IDS.has(Number(catId))) continue;
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
 * @param {number[]} [dolaresPorMes] - dólar resuelto de cada mes (mismo índice
 *   que meses); tiene prioridad sobre el campo crudo m.dolarCCL.
 * @returns {Array<{ mes: string, ahorroMes: number, acumulado: number, acumuladoUSD: number }>}
 */
export function calcAhorroAcumulado(meses, modo = 'real', dolarCCLActual = 1, dolaresPorMes = null) {
  let acumulado = 0;
  const result = [];
  for (let i = 0; i < meses.length; i++) {
    const m = meses[i];
    const dolarMes = dolaresPorMes?.[i] || m?.dolarCCL || dolarCCLActual;
    if (!m) { result.push({ ahorroMes: 0, acumulado, acumuladoUSD: safeDivide(acumulado, dolarMes) }); continue; }
    const ingresos = calcTotalIngresos(m.ingresos, modo);
    const egresos = calcTotalEgresos(m.egresos, modo);
    const ahorroMes = ingresos - egresos;
    acumulado += ahorroMes;
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
      if (TRANSFERENCIA_IDS.has(Number(catId))) continue;
      if (!result[catId]) result[catId] = new Array(12).fill(0);
      result[catId][i] = calcSubtotalCategoria(cat, modo);
    }
  }
  return result;
}

