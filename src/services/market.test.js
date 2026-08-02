/**
 * Tests de los cálculos de mercado e inflación (funciones puras, sin red).
 */

import { describe, it, expect } from 'vitest';
import { calcDolarRealHistorico, variacionSP500, tnaAMensual } from './market.js';
import { acumularInflacion, acumularDolar } from './inflation.js';
import { parseHoldings, holdingsATexto, valuarHoldings, tickersEnUso } from './quotes.js';

describe('inflación acumulada', () => {
  it('compone las variaciones mensuales (no las suma)', () => {
    const r = acumularInflacion([10, 10]);
    expect(r[0]).toBeCloseTo(10, 5);
    expect(r[1]).toBeCloseTo(21, 5); // 1,1 × 1,1 = 1,21 → no 20%
  });

  it('respeta los meses sin dato publicado', () => {
    const r = acumularInflacion([2, null, 3]);
    expect(r[0]).toBeCloseTo(2, 5);
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(5.06, 2); // sigue componiendo con lo que hay
  });

  it('con serie vacía devuelve vacío', () => {
    expect(acumularInflacion([])).toEqual([]);
  });
});

describe('dólar acumulado', () => {
  it('mide la variación contra el primer mes con dato', () => {
    const r = acumularDolar([1000, 1100, 1500], 3);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(10, 5);
    expect(r[2]).toBeCloseTo(50, 5);
  });

  it('ignora meses futuros y valores inválidos', () => {
    const r = acumularDolar([1000, 0, 1200], 3);
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(20, 5);
    expect(acumularDolar([1000, 1100], 1)[1]).toBeNull(); // fuera de nMeses
  });
});

describe('dólar real histórico (caro o barato)', () => {
  // Escenario: 12 meses, 5% de inflación argentina mensual y 0% en EE.UU.
  const meses = Array.from({ length: 13 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return i < 12 ? `2025-${m}` : '2026-01';
  });
  const inflARS = meses.map(f => ({ fecha: `${f}-01`, valor: 5 }));
  const inflUSA = meses.map(f => ({ fecha: `${f}-01`, valor: 0 }));

  it('trae los dólares pasados a pesos de hoy y detecta atraso', () => {
    // El CCL quedó clavado en 1000 mientras los precios subieron 5% mensual
    const serieCCL = meses.map(mes => ({ mes, valor: 1000 }));
    const r = calcDolarRealHistorico(1000, serieCCL, inflARS, inflUSA, 50);
    expect(r).not.toBeNull();
    // Cada CCL viejo vale MÁS en pesos de hoy → el promedio supera al actual
    expect(r.promedio).toBeGreaterThan(1000);
    expect(r.desvioPct).toBeLessThan(0); // dólar barato en términos reales
  });

  it('un dólar que sigue a la inflación queda en su promedio', () => {
    // CCL que acompaña exactamente el 5% mensual
    const serieCCL = meses.map((mes, i) => ({ mes, valor: 1000 * Math.pow(1.05, i) }));
    const cclHoy = 1000 * Math.pow(1.05, meses.length - 1);
    const r = calcDolarRealHistorico(cclHoy, serieCCL, inflARS, inflUSA, 50);
    // Todos los puntos valen lo mismo en pesos de hoy → desvío ~0
    expect(Math.abs(r.desvioPct)).toBeLessThan(1);
  });

  it('la inflación de EE.UU. abarata el dólar en términos reales', () => {
    const serieCCL = meses.map(mes => ({ mes, valor: 1000 }));
    const conUSA = meses.map(f => ({ fecha: `${f}-01`, valor: 1 }));
    const sinUSA = calcDolarRealHistorico(1000, serieCCL, inflARS, inflUSA, 50);
    const rConUSA = calcDolarRealHistorico(1000, serieCCL, inflARS, conUSA, 50);
    expect(rConUSA.promedio).toBeLessThan(sinUSA.promedio);
  });

  it('devuelve null si faltan datos para comparar', () => {
    expect(calcDolarRealHistorico(0, [{ mes: '2025-01', valor: 1000 }], inflARS, inflUSA)).toBeNull();
    expect(calcDolarRealHistorico(1000, [], inflARS, inflUSA)).toBeNull();
    expect(calcDolarRealHistorico(1000, [{ mes: '2025-01', valor: 1000 }], [], [])).toBeNull();
  });
});

describe('S&P 500 y tasas', () => {
  const serie = [
    { mes: '2026-05', precio: 700 },
    { mes: '2026-06', precio: 750 },
    { mes: '2026-07', precio: 735 },
  ];

  it('calcula la variación entre dos meses', () => {
    expect(variacionSP500(serie, '2026-05', '2026-06')).toBeCloseTo(7.14, 2);
    expect(variacionSP500(serie, '2026-06', '2026-07')).toBeCloseTo(-2, 2);
  });

  it('devuelve null si falta alguno de los meses', () => {
    expect(variacionSP500(serie, '2026-04', '2026-07')).toBeNull();
    expect(variacionSP500([], '2026-05', '2026-06')).toBeNull();
  });

  it('convierte TNA a mensual', () => {
    expect(tnaAMensual(24)).toBe(2);
    expect(tnaAMensual(16.8)).toBeCloseTo(1.4, 5);
    expect(tnaAMensual(null)).toBe(0);
  });
});

describe('tenencias de cartera', () => {
  it('parsea distintos formatos de carga', () => {
    expect(parseHoldings('AAPL 10, KO 5')).toEqual([
      { ticker: 'AAPL', cantidad: 10 },
      { ticker: 'KO', cantidad: 5 },
    ]);
    expect(parseHoldings('aapl:10;msft=2')).toEqual([
      { ticker: 'AAPL', cantidad: 10 },
      { ticker: 'MSFT', cantidad: 2 },
    ]);
    expect(parseHoldings('AL30 1500,5')).toEqual([{ ticker: 'AL30', cantidad: 1500.5 }]);
  });

  it('descarta entradas inválidas sin romper', () => {
    expect(parseHoldings('')).toEqual([]);
    expect(parseHoldings(null)).toEqual([]);
    expect(parseHoldings('solo texto')).toEqual([]);
    expect(parseHoldings('AAPL 0')).toEqual([]);      // cantidad cero
    expect(parseHoldings('AAPL -5')).toEqual([]);     // negativa
  });

  it('ida y vuelta texto ↔ holdings', () => {
    const t = 'AAPL 10, KO 5';
    expect(holdingsATexto(parseHoldings(t))).toBe(t);
    expect(holdingsATexto([])).toBe('');
  });

  it('valúa tenencias y reporta tickers sin precio', () => {
    const precios = { AAPL: { precio: 24000, tipo: 'cedear', variacion: 1 } };
    const r = valuarHoldings([{ ticker: 'AAPL', cantidad: 10 }, { ticker: 'XXXX', cantidad: 5 }], precios);
    expect(r.total).toBe(240000);
    expect(r.detalle).toHaveLength(1);
    expect(r.faltantes).toEqual(['XXXX']);
  });

  it('con precios vacíos no rompe', () => {
    const r = valuarHoldings([{ ticker: 'AAPL', cantidad: 10 }], {});
    expect(r.total).toBe(0);
    expect(r.faltantes).toEqual(['AAPL']);
  });

  it('lista los tickers en uso de toda la cartera', () => {
    const portfolio = {
      liquidez: { a: { holdings: [{ ticker: 'TX26', cantidad: 100 }] } },
      inversiones: { b: { holdings: [{ ticker: 'AAPL', cantidad: 1 }] }, c: { monto: 500 } },
    };
    expect(tickersEnUso(portfolio).sort()).toEqual(['AAPL', 'TX26']);
    expect(tickersEnUso(null)).toEqual([]);
  });
});
