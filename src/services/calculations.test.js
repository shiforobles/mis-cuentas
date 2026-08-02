/**
 * Tests de los cálculos financieros.
 *
 * Cubre las reglas de negocio que, si se rompen, muestran plata mal:
 * qué cuenta como gasto, cómo se separan inversión y pago de tarjeta, sobre
 * qué base se miden los porcentajes, y la regla de "nunca NaN/Infinity".
 */

import { describe, it, expect } from 'vitest';
import {
  calcTotalIngresos,
  calcTotalEgresos,
  calcTotalMovimientosCapital,
  calcTotalPagosTarjeta,
  calcConsumosTarjeta,
  calcSubtotalCategoria,
  calcRestante,
  calcIngresosUSD,
  calcPorcentajeCategoria,
  calcSemaforo,
  calcSemaforoAhorro,
  calcDistribucionIdeal,
  calcCartera,
  calcRebalanceo,
  calcFondoEmergencia,
  calcGastoMensualPromedio,
  calcTotalAnual,
  calcTotalHoras,
  calcTopGastos,
  calcAhorroAcumulado,
  calcProyeccionAnual,
  calcTendenciaGastos,
} from './calculations.js';

// ─── Helpers de armado de datos ─────────────────────────────

const item = (descripcion, proyectado = 0, real = 0, extra = {}) =>
  ({ id: descripcion, descripcion, proyectado, real, ...extra });

/** Mes de ejemplo: gastos comunes + inversión (cat 8) + pago tarjeta (cat 7). */
function mesEjemplo() {
  return {
    ingresos: [
      item('Sueldo', 1000000, 1200000, { horasMensuales: '96hs' }),
      item('Extra', 200000, 150000, { horasMensuales: '10hs' }),
    ],
    egresos: {
      1: { items: [item('Alquiler', 300000, 320000), item('Luz', 20000, 18000)] },
      2: { items: [item('Nafta', 50000, 40000)] },
      7: { items: [item('VISA', 100000, 250000)] },        // pago de resumen
      8: { items: [item('Dólar MEP', 0, 400000)] },        // inversión
    },
  };
}

// ─── Totales y clasificación de categorías ──────────────────

describe('totales y clasificación de categorías', () => {
  it('suma ingresos por modo', () => {
    const m = mesEjemplo();
    expect(calcTotalIngresos(m.ingresos, 'proyectado')).toBe(1200000);
    expect(calcTotalIngresos(m.ingresos, 'real')).toBe(1350000);
  });

  it('los egresos EXCLUYEN inversión y pago de tarjeta', () => {
    const m = mesEjemplo();
    // real: 320000 + 18000 + 40000 = 378000 (sin los 250k de VISA ni los 400k de MEP)
    expect(calcTotalEgresos(m.egresos, 'real')).toBe(378000);
    expect(calcTotalEgresos(m.egresos, 'proyectado')).toBe(370000);
  });

  it('separa inversión de pago de tarjeta', () => {
    const m = mesEjemplo();
    expect(calcTotalMovimientosCapital(m.egresos, 'real')).toBe(400000);
    expect(calcTotalPagosTarjeta(m.egresos, 'real')).toBe(250000);
  });

  it('pagar el resumen de tarjeta no infla los gastos (no hay doble conteo)', () => {
    const m = mesEjemplo();
    const sinPago = { ...m.egresos };
    delete sinPago[7];
    expect(calcTotalEgresos(m.egresos, 'real')).toBe(calcTotalEgresos(sinPago, 'real'));
  });

  it('tolera datos ausentes o basura sin romper', () => {
    expect(calcTotalIngresos(null)).toBe(0);
    expect(calcTotalIngresos('no es array')).toBe(0);
    expect(calcTotalEgresos(null)).toBe(0);
    expect(calcSubtotalCategoria(undefined)).toBe(0);
    expect(calcSubtotalCategoria({ items: [{ real: 'abc' }] }, 'real')).toBe(0);
  });
});

// ─── Consumos con tarjeta (medio de pago) ───────────────────

describe('consumos con tarjeta', () => {
  const txs = [
    { type: 'egreso', categoryId: 1, amount: 50000, medioPago: 'visa' },
    { type: 'egreso', categoryId: 1, amount: 30000, medioPago: 'mastercard' },
    { type: 'egreso', categoryId: 2, amount: 10000, medioPago: 'efectivo' },
    { type: 'egreso', categoryId: 2, amount: 5000 },                       // sin medio → efectivo
    { type: 'ingreso', categoryId: null, amount: 900000, medioPago: 'visa' }, // ingreso: no cuenta
    { type: 'egreso', categoryId: 7, amount: 250000, medioPago: 'visa' },  // pago de resumen: no es consumo
    { type: 'egreso', categoryId: 8, amount: 400000, medioPago: 'visa' },  // inversión: no es consumo
  ];

  it('suma solo gastos reales pagados con tarjeta', () => {
    const { total, porTarjeta } = calcConsumosTarjeta(txs);
    expect(total).toBe(80000);
    expect(porTarjeta.visa).toBe(50000);
    expect(porTarjeta.mastercard).toBe(30000);
  });

  it('trata las transacciones sin medio de pago como efectivo', () => {
    const { total } = calcConsumosTarjeta([{ type: 'egreso', categoryId: 1, amount: 999, medioPago: null }]);
    expect(total).toBe(0);
  });

  it('devuelve cero con entrada vacía', () => {
    expect(calcConsumosTarjeta(null).total).toBe(0);
    expect(calcConsumosTarjeta([]).total).toBe(0);
  });
});

// ─── Nunca NaN / Infinity / división por cero ───────────────

describe('robustez numérica (nunca NaN ni Infinity)', () => {
  it('convierte a USD sin romper con dólar 0 o inválido', () => {
    expect(calcIngresosUSD(100000, 0)).toBe(0);
    expect(calcIngresosUSD(100000, null)).toBe(0);
    expect(calcIngresosUSD(Infinity, 1000)).toBe(0);
    expect(calcIngresosUSD(100000, 1000)).toBe(100);
  });

  it('porcentaje con total 0 da 0, no NaN', () => {
    expect(calcPorcentajeCategoria(500, 0)).toBe(0);
    expect(calcPorcentajeCategoria(0, 0)).toBe(0);
    expect(calcPorcentajeCategoria(25, 100)).toBe(25);
  });

  it('restante calcula ARS y USD', () => {
    const r = calcRestante(1000000, 400000, 1000);
    expect(r.ars).toBe(600000);
    expect(r.usd).toBe(600);
    expect(calcRestante(1000, 500, 0).usd).toBe(0);
  });

  it('ningún cálculo del mes devuelve NaN con datos vacíos', () => {
    const vacio = { ingresos: [], egresos: {} };
    const valores = [
      calcTotalIngresos(vacio.ingresos, 'real'),
      calcTotalEgresos(vacio.egresos, 'real'),
      calcRestante(0, 0, 0).ars,
      calcRestante(0, 0, 0).usd,
      calcTotalHoras(vacio.ingresos),
      calcProyeccionAnual([vacio], 'real', 0).proyectado12,
    ];
    valores.forEach(v => {
      expect(Number.isNaN(v)).toBe(false);
      expect(Number.isFinite(v)).toBe(true);
    });
  });
});

// ─── Semáforos ──────────────────────────────────────────────

describe('semáforos', () => {
  it('en gastos, pasarse es lo malo', () => {
    expect(calcSemaforo(30, 30)).toBe('ok');
    expect(calcSemaforo(30, 31)).toBe('ok');        // dentro del 5%
    expect(calcSemaforo(30, 35)).toBe('warning');   // +17%
    expect(calcSemaforo(30, 50)).toBe('danger');    // +66%
    expect(calcSemaforo(30, 10)).toBe('ok');        // gastar de menos está bien
  });

  it('con ideal 0%, cualquier gasto es desvío', () => {
    expect(calcSemaforo(0, 0)).toBe('ok');
    expect(calcSemaforo(0, 5)).toBe('warning');
  });

  it('en ahorro, quedarse corto es lo malo (semáforo invertido)', () => {
    expect(calcSemaforoAhorro(20, 25)).toBe('ok');      // superó el objetivo
    expect(calcSemaforoAhorro(20, 20)).toBe('ok');
    expect(calcSemaforoAhorro(20, 15)).toBe('warning'); // a mitad de camino
    expect(calcSemaforoAhorro(20, 2)).toBe('danger');   // muy por debajo
    expect(calcSemaforoAhorro(0, 0)).toBe('ok');
  });
});

// ─── Distribución ideal: base ingresos ──────────────────────

describe('distribución ideal', () => {
  const ideal = {
    1: { nombre: 'Hogar', percent: 40 },
    2: { nombre: 'Transporte', percent: 5 },
    7: { nombre: 'Tarjetas', percent: 10 },
    8: { nombre: 'Ahorro', percent: 20 },
  };

  it('mide los porcentajes sobre los INGRESOS del mes', () => {
    const m = mesEjemplo(); // ingresos reales 1.350.000
    const filas = calcDistribucionIdeal(m.egresos, ideal, 'real', m.ingresos);
    const hogar = filas.find(f => f.catId === 1);
    // Hogar real 338.000 sobre ingresos 1.350.000 = 25,04%
    expect(hogar.percentActual).toBeCloseTo(25.04, 1);
    expect(hogar.base).toBe(1350000);
    expect(hogar.sobreIngresos).toBe(true);
  });

  it('excluye el pago de tarjeta de la tabla', () => {
    const m = mesEjemplo();
    const filas = calcDistribucionIdeal(m.egresos, ideal, 'real', m.ingresos);
    expect(filas.find(f => f.catId === 7)).toBeUndefined();
  });

  it('incluye la inversión y la marca como tal', () => {
    const m = mesEjemplo();
    const filas = calcDistribucionIdeal(m.egresos, ideal, 'real', m.ingresos);
    const ahorro = filas.find(f => f.catId === 8);
    expect(ahorro.esInversion).toBe(true);
    // 400.000 sobre 1.350.000 = 29,6% → superó el 20% objetivo
    expect(ahorro.percentActual).toBeCloseTo(29.63, 1);
    expect(ahorro.semaforo).toBe('ok');
  });

  it('sin ingresos cargados cae a la base de egresos', () => {
    const m = mesEjemplo();
    const filas = calcDistribucionIdeal(m.egresos, ideal, 'real', []);
    expect(filas[0].sobreIngresos).toBe(false);
    expect(filas[0].base).toBe(378000); // total de egresos
  });

  it('no rompe si no hay ni ingresos ni egresos', () => {
    const filas = calcDistribucionIdeal({}, ideal, 'real', []);
    filas.forEach(f => {
      expect(Number.isNaN(f.percentActual)).toBe(false);
      expect(f.percentActual).toBe(0);
    });
  });
});

// ─── Cartera, rebalanceo y fondo de emergencia ──────────────

describe('cartera', () => {
  const portfolio = {
    liquidez: {
      pesos: { monto: 1000000, moneda: 'ARS', label: 'Pesos' },
      dolares: { monto: 1000, moneda: 'USD', label: 'USD' },
    },
    inversiones: {
      cedears: { monto: 2000000, moneda: 'ARS', label: 'CEDEARs' },
    },
    targets: { liquidezPct: 30, usdPct: 50 },
    emergenciaKey: 'dolares',
  };

  it('convierte cada línea a ARS y USD con el CCL', () => {
    const c = calcCartera(portfolio, 1000);
    expect(c.liquidez.dolares.ars).toBe(1000000); // 1000 USD × 1000
    expect(c.liquidez.pesos.usd).toBe(1000);      // 1.000.000 / 1000
    expect(c.totals.granTotalARS).toBe(4000000);
    expect(c.totals.granTotalUSD).toBe(4000);
  });

  it('calcula la exposición por moneda', () => {
    const c = calcCartera(portfolio, 1000);
    expect(c.totals.exposicionUSD).toBe(1000000); // solo la línea en USD
    expect(c.totals.exposicionARS).toBe(3000000);
  });

  it('con dólar 0 no genera NaN y conserva lo que ya está en USD', () => {
    const c = calcCartera(portfolio, 0);
    expect(Number.isFinite(c.totals.granTotalARS)).toBe(true);
    expect(Number.isFinite(c.totals.granTotalUSD)).toBe(true);
    // Sin cotización no se puede pasar pesos a dólares (queda en 0), pero los
    // 1000 USD de la línea en dólares siguen valiendo 1000 USD.
    expect(c.totals.granTotalUSD).toBe(1000);
    expect(c.liquidez.dolares.ars).toBe(0);
  });

  it('el rebalanceo detecta el lado excedido', () => {
    const c = calcCartera(portfolio, 1000);
    const reb = calcRebalanceo(c.totals, portfolio.targets, 1000);
    // Liquidez 2.000.000 de 4.000.000 = 50% contra objetivo 30% → sobra liquidez
    expect(reb.bloque.a.curPct).toBe(50);
    expect(reb.bloque.origen).toBe('Liquidez');
    expect(reb.bloque.destino).toBe('Inversiones');
    expect(reb.bloque.alerta).toBe(true);
    expect(reb.bloque.ajusteARS).toBe(800000); // 20 pp de 4.000.000
  });

  it('el rebalanceo devuelve null con cartera vacía', () => {
    expect(calcRebalanceo({ granTotalARS: 0 }, {}, 1000)).toBeNull();
    expect(calcRebalanceo(null, {}, 1000)).toBeNull();
  });

  it('el fondo de emergencia mide meses de gasto cubiertos', () => {
    const meses = [
      { egresos: { 1: { items: [item('x', 0, 250000)] } } },
      { egresos: { 1: { items: [item('x', 0, 350000)] } } },
    ];
    const fe = calcFondoEmergencia(portfolio, meses, 1000);
    expect(fe.configurado).toBe(true);
    expect(fe.gastoMensualARS).toBe(300000);      // promedio real
    expect(fe.fondoARS).toBe(1000000);            // 1000 USD × 1000
    expect(fe.mesesCubiertos).toBeCloseTo(3.33, 1);
    expect(fe.alcanza).toBe(true);                // objetivo 3 meses
  });

  it('el gasto promedio usa real y cae a proyectado si no hay real', () => {
    const soloProy = [{ egresos: { 1: { items: [item('x', 100000, 0)] } } }];
    const g = calcGastoMensualPromedio(soloProy);
    expect(g.modo).toBe('proyectado');
    expect(g.promedioARS).toBe(100000);
    expect(calcGastoMensualPromedio([]).promedioARS).toBe(0);
  });
});

// ─── Series anuales ─────────────────────────────────────────

describe('cálculos anuales', () => {
  it('usa el dólar de CADA mes, no el de hoy', () => {
    const meses = [
      { ingresos: [item('a', 0, 1000000)], egresos: {} },
      { ingresos: [item('b', 0, 1000000)], egresos: {} },
    ];
    // Mismo monto en pesos, distinto dólar → distinto valor en USD
    const r = calcTotalAnual(meses, 'real', 9999, [1000, 2000]);
    expect(r.totalARS).toBe(2000000);
    expect(r.totalUSD).toBe(1500); // 1000 + 500
    expect(r.mesesConDatos).toBe(2);
  });

  it('el ahorro acumulado suma mes a mes', () => {
    const meses = [
      { ingresos: [item('a', 0, 1000000)], egresos: { 1: { items: [item('g', 0, 400000)] } } },
      { ingresos: [item('b', 0, 800000)], egresos: { 1: { items: [item('g', 0, 900000)] } } },
    ];
    const a = calcAhorroAcumulado(meses, 'real', 1000, [1000, 1000]);
    expect(a[0].ahorroMes).toBe(600000);
    expect(a[1].ahorroMes).toBe(-100000);
    expect(a[1].acumulado).toBe(500000);
  });

  it('la inversión no se descuenta del ahorro (no es gasto)', () => {
    const meses = [{
      ingresos: [item('a', 0, 1000000)],
      egresos: { 1: { items: [item('g', 0, 200000)] }, 8: { items: [item('mep', 0, 500000)] } },
    }];
    // 1.000.000 − 200.000 = 800.000 (los 500.000 invertidos siguen siendo tuyos)
    expect(calcAhorroAcumulado(meses, 'real', 1000)[0].ahorroMes).toBe(800000);
  });

  it('la proyección anual extrapola el promedio mensual', () => {
    const meses = [
      { ingresos: [item('a', 0, 1000000)], egresos: { 1: { items: [item('g', 0, 500000)] } } },
      null, null,
    ];
    const p = calcProyeccionAnual(meses, 'real', 1000);
    expect(p.mesesConDatos).toBe(1);
    expect(p.promedioMensual).toBe(500000);
    expect(p.proyectado12).toBe(6000000);
  });

  it('suma horas en distintos formatos', () => {
    expect(calcTotalHoras([
      item('a', 0, 0, { horasMensuales: '96hs' }),
      item('b', 0, 0, { horasMensuales: '9,5hs' }),
      item('c', 0, 0, { horasMensuales: '' }),
    ])).toBe(105.5);
  });

  it('el top de gastos ordena e ignora inversión y tarjeta', () => {
    const egresos = {
      1: { items: [item('Alquiler', 0, 300000), item('Luz', 0, 20000)] },
      7: { items: [item('VISA', 0, 999999)] },
      8: { items: [item('MEP', 0, 999999)] },
    };
    const top = calcTopGastos(egresos, 5, [{ id: 1, nombre: 'Hogar', icon: '🏠' }]);
    expect(top).toHaveLength(2);
    expect(top[0].descripcion).toBe('Alquiler');
    expect(top[0].catNombre).toBe('Hogar');
  });

  it('la tendencia excluye categorías que no son gasto', () => {
    const meses = [mesEjemplo()];
    const t = calcTendenciaGastos(meses, 'real');
    expect(t['1'][0]).toBe(338000);
    expect(t['7']).toBeUndefined();
    expect(t['8']).toBeUndefined();
  });
});
