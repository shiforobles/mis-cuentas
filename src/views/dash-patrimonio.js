/**
 * Dashboard Tab 4 — PATRIMONIO / AHORRO
 * Evolución patrimonial, ahorro acumulado, proyección de fin de año,
 * y evolución de cartera (F4).
 */
import { allMonths, dolarPorMes, dolarCCL, chartInstances, getChartDefaults, configData, portfolioData } from './dashboard.js';
import { calcAhorroAcumulado, calcProyeccionAnual, calcTotalMovimientosCapital, calcRentaPasiva, calcCartera, calcTotalEgresos } from '../services/calculations.js';
import { getPortfolioHistoryByYear, calcPortfolioEvolution, calcPortfolioReturns, deletePortfolioSnapshot } from '../services/portfolio-history.js';
import { getInflacionYear, getInflacionUSAYear, getInflacionSerie, getInflacionUSASerie, getRiesgoPais, acumularInflacion, acumularDolar } from '../services/inflation.js';
import { getTasaPlazoFijo, getCCLHistoricoMensual, getSP500Mensual, calcDolarRealHistorico, variacionSP500, tnaAMensual } from '../services/market.js';
import { formatARS, formatUSD, formatPercent } from '../utils/format.js';
import { MESES_SHORT, mesesTranscurridos } from '../utils/constants.js';
import { showToast } from '../utils/helpers.js';

/** Total de egresos reales de un mes, tolerante a meses vacíos. */
function calcTotalEgresosSafe(mes) {
  try {
    return calcTotalEgresos(mes?.egresos, 'real');
  } catch { return 0; }
}

export async function renderTabPatrimonio(panel) {
  const ahorro = calcAhorroAcumulado(allMonths, 'real', dolarCCL, dolarPorMes);
  const proy = calcProyeccionAnual(allMonths, 'real', dolarCCL);
  const acumuladoActual = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumulado : 0;
  const acumuladoUSD = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumuladoUSD : 0;
  const año = configData?.año || 2026;

  // F4: Load portfolio evolution + rendimiento real (Δ − aportes)
  const snapshots = await getPortfolioHistoryByYear(año);
  const evolution = calcPortfolioEvolution(snapshots);
  const returns = calcPortfolioReturns(evolution, allMonths,
    (egresos) => calcTotalMovimientosCapital(egresos, 'real'));

  // Inflación (IPC INDEC) + dólar acumulado del año
  const nMeses = mesesTranscurridos(año);
  const inflMensual = await getInflacionYear(año);
  const inflAcum = acumularInflacion(inflMensual);
  const dolarAcum = acumularDolar(dolarPorMes, nMeses);
  const ultimoConDato = (() => { let k = -1; inflAcum.forEach((v, i) => { if (v != null) k = i; }); return k; })();
  const inflAcumTotal = ultimoConDato >= 0 ? inflAcum[ultimoConDato] : null;
  const dolarAcumMismoMes = ultimoConDato >= 0 ? dolarAcum[ultimoConDato] : null;
  const poderCompra = inflAcumTotal != null ? (1 / (1 + inflAcumTotal / 100) - 1) * 100 : null;

  // Inflación de EE.UU. (poder de compra del dólar) + riesgo país (bonos AR en USD)
  const inflUSAMensual = await getInflacionUSAYear(año);
  const inflUSAAcum = acumularInflacion(inflUSAMensual);
  const ultimoUSA = (() => { let k = -1; inflUSAAcum.forEach((v, i) => { if (v != null) k = i; }); return k; })();
  const inflUSAAcumTotal = ultimoUSA >= 0 ? inflUSAAcum[ultimoUSA] : null;
  const poderCompraUSD = inflUSAAcumTotal != null ? (1 / (1 + inflUSAAcumTotal / 100) - 1) * 100 : null;
  const riesgo = await getRiesgoPais();
  const riesgoPrevio = riesgo.serie.length >= 2 ? riesgo.serie[riesgo.serie.length - 2] : null;
  const riesgoDelta = riesgo.actual && riesgoPrevio ? riesgo.actual.valor - riesgoPrevio.valor : null;

  // Brecha cambiaria: CCL vs oficial (el widget del dólar ya trae todas las casas)
  const todasCotiz = configData?.dolarTodas || {};
  const oficial = Number(todasCotiz.oficial?.venta) || 0;
  const cclActual = Number(todasCotiz.contadoconliqui?.venta) || dolarCCL || 0;
  const brechaPct = oficial > 0 && cclActual > 0 ? ((cclActual / oficial) - 1) * 100 : null;

  // Tasa en pesos vs inflación (¿la liquidez remunerada empata los precios?)
  const tasa = await getTasaPlazoFijo();
  const inflUltimoMensual = (() => { let v = null; inflMensual.forEach(x => { if (x != null) v = x; }); return v; })();
  const mejorMensual = tasa?.mejor ? tnaAMensual(tasa.mejor.tna) : null;
  // Tasa propia (la que realmente le pagan al usuario). Si no la cargó, se
  // evalúa contra la mejor del mercado como referencia.
  const tnaPropia = Number(configData?.tasaPesosPropia) || null;
  const propiaMensual = tnaPropia ? tnaAMensual(tnaPropia) : null;
  const tasaUsada = propiaMensual ?? mejorMensual;
  const tasaVsInflacion = tasaUsada != null && inflUltimoMensual != null ? tasaUsada - inflUltimoMensual : null;
  // Cuánto se deja de ganar por no estar en la mejor tasa del mercado
  const vsMejor = propiaMensual != null && mejorMensual != null ? propiaMensual - mejorMensual : null;
  // Pesos expuestos: liquidez en ARS de la cartera (lo que sufre o gana con la tasa)
  const pesosEnRiesgo = Object.values(portfolioData?.liquidez || {})
    .filter(i => (i.moneda || 'ARS') !== 'USD')
    .reduce((s, i) => s + (Number(i.monto) || 0), 0);
  const impactoMensualPesos = tasaVsInflacion != null ? pesosEnRiesgo * (tasaVsInflacion / 100) : null;
  const costoNoMoverse = vsMejor != null ? pesosEnRiesgo * (vsMejor / 100) : null;

  // Rendimiento de los dólares contra la inflación de EE.UU. (la vara real
  // para la plata dolarizada: el dólar quieto también pierde poder de compra).
  const tnaUSD = Number(configData?.tasaDolaresPropia) || null;
  const dolaresEnCartera = Object.values(portfolioData?.liquidez || {})
    .filter(i => (i.moneda || 'ARS') === 'USD')
    .reduce((s, i) => s + (Number(i.monto) || 0), 0);
  // Inflación USA anualizada a partir de lo acumulado del año en curso.
  const inflUSAAnualizada = inflUSAAcumTotal != null && ultimoUSA >= 0
    ? (Math.pow(1 + inflUSAAcumTotal / 100, 12 / (ultimoUSA + 1)) - 1) * 100
    : null;
  const usdVsInflacion = tnaUSD != null && inflUSAAnualizada != null ? tnaUSD - inflUSAAnualizada : null;
  const impactoAnualUSD = usdVsInflacion != null ? dolaresEnCartera * (usdVsInflacion / 100) : null;

  // Renta pasiva (dividendos, cupones, intereses) y su yield sobre lo invertido
  const carteraCalc = portfolioData ? calcCartera(portfolioData, dolarCCL) : null;
  const invertidoARS = carteraCalc?.totals?.inversionesARS || 0;
  const renta = calcRentaPasiva(allMonths, invertidoARS, 'real');
  const gastoMensualProm = (() => {
    const conDatos = allMonths.filter(m => m && calcTotalEgresosSafe(m) > 0);
    if (!conDatos.length) return 0;
    return conDatos.reduce((s, m) => s + calcTotalEgresosSafe(m), 0) / conDatos.length;
  })();
  const coberturaGastos = gastoMensualProm > 0 ? (renta.promedioMensual / gastoMensualProm) * 100 : null;

  // Dólar caro o barato (CCL de hoy vs su promedio real de los últimos años)
  const [cclHist, inflARSSerie, inflUSASerie, sp500] = await Promise.all([
    getCCLHistoricoMensual(), getInflacionSerie(), getInflacionUSASerie(), getSP500Mensual(),
  ]);
  const dolarReal = cclHist?.serie
    ? calcDolarRealHistorico(cclActual, cclHist.serie, inflARSSerie, inflUSASerie, 4)
    : null;

  // Benchmark S&P 500: rendimiento de la cartera vs el índice, mes a mes
  const MESES_NUM = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };
  const mesKeyISO = (mesId) => `${año}-${MESES_NUM[mesId] || '01'}`;
  const benchmark = returns.map((e, i) => {
    const prev = i > 0 ? returns[i - 1] : null;
    const spy = prev && sp500?.serie
      ? variacionSP500(sp500.serie, mesKeyISO(prev.mesId), mesKeyISO(e.mesId))
      : null;
    // El rendimiento propio se mide en USD para comparar contra el S&P (que cotiza en USD)
    const propioPct = prev && prev.granTotalUSD > 0 && e.rendimientoUSD != null
      ? (e.rendimientoUSD / prev.granTotalUSD) * 100
      : null;
    return { ...e, spyPct: spy, propioPctUSD: propioPct, alfa: spy != null && propioPct != null ? propioPct - spy : null };
  });
  const conBenchmark = benchmark.filter(b => b.alfa != null);

  panel.innerHTML = `
    <div class="dashboard-grid">
      <div class="section"><div class="card card--accent">
        <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-1)">AHORRO ACUMULADO ${año}</div>
        <div style="font-size:var(--font-size-2xl);font-weight:800;color:${acumuladoActual >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(acumuladoActual)}</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-info-text);margin-top:2px">${formatUSD(acumuladoUSD)}</div>
      </div></div>

      <div class="section"><div class="card card--accent">
        <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-1)">PROYECCIÓN FIN DE AÑO</div>
        <div style="font-size:var(--font-size-2xl);font-weight:800;color:${proy.proyectado12 >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(proy.proyectado12)}</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-info-text);margin-top:2px">${formatUSD(proy.proyectadoUSD)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Promedio mensual: ${formatARS(proy.promedioMensual)} · ${proy.mesesConDatos} meses con datos</div>
      </div></div>
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📈</span> Ahorro Acumulado</h3>
      <div class="chart-container" style="height:300px"><canvas id="chart-ahorro-acum"></canvas></div>
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">💰</span> Ahorro Mensual</h3>
      <div class="chart-container" style="height:250px"><canvas id="chart-ahorro-mensual"></canvas></div>
    </div>

    <!-- Inflación y poder de compra -->
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🔥</span> Inflación y poder de compra (${año})</h3>
      ${inflAcumTotal != null ? `
        <div class="dashboard-grid" style="margin-bottom:var(--space-3)">
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">INFLACIÓN ACUMULADA (a ${MESES_SHORT[ultimoConDato]})</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-danger-text)">${formatPercent(inflAcumTotal)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">$100 de enero hoy compran como ${formatARS(100 * (1 + (poderCompra || 0) / 100))} → tu peso perdió ${formatPercent(Math.abs(poderCompra || 0))} de poder de compra</div>
          </div>
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">DÓLAR CCL EN EL MISMO PERÍODO</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:${(dolarAcumMismoMes || 0) >= inflAcumTotal ? 'var(--color-success-text)' : 'var(--color-warning-text, #d97706)'}">${dolarAcumMismoMes != null ? '+' + formatPercent(dolarAcumMismoMes) : '—'}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${dolarAcumMismoMes != null ? (dolarAcumMismoMes >= inflAcumTotal
              ? 'El dólar subió más que la inflación: ahorrar en USD te protegió ✓'
              : `El dólar subió menos que la inflación: tus USD perdieron ${formatPercent(inflAcumTotal - dolarAcumMismoMes)} contra los precios`) : ''}</div>
          </div>
        </div>
        ${inflUSAAcumTotal != null ? `
        <div class="dashboard-grid" style="margin-bottom:var(--space-3)">
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">INFLACIÓN EE.UU. ACUMULADA (a ${MESES_SHORT[ultimoUSA]})</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-warning-text, #d97706)">${formatPercent(inflUSAAcumTotal)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">El dólar también pierde: US$100 de enero compran como US$${(100 * (1 + (poderCompraUSD || 0) / 100)).toLocaleString('es-AR', {maximumFractionDigits: 1})}. Tus dólares "quietos" (billete/USDT sin rendimiento) pierden esto por año.</div>
          </div>
          ${riesgo.actual ? `
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">RIESGO PAÍS (${riesgo.actual.fecha})</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-info-text)">${riesgo.actual.valor} pb ${riesgoDelta != null ? `<span style="font-size:var(--font-size-sm);color:${riesgoDelta <= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${riesgoDelta <= 0 ? '▼' : '▲'} ${Math.abs(riesgoDelta)}</span>` : ''}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Sobretasa que pagan los bonos argentinos en USD (AL30/GD30, ONs). Si baja, esos bonos suben de precio; si sube, caen.</div>
          </div>` : ''}
        </div>` : ''}
        <div class="chart-container" style="height:280px"><canvas id="chart-inflacion"></canvas></div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Fuentes: IPC INDEC y riesgo país (ArgentinaDatos), CPI EE.UU. (StatBureau). El dato de cada mes se publica a mitad del mes siguiente.</div>
      ` : `
        <div class="text-muted" style="font-size:var(--font-size-sm)">Sin datos de inflación todavía (se descargan automáticamente con conexión).</div>
      `}
    </div>

    <!-- Tus pesos vs la inflación (tasa de plazo fijo de referencia) -->
    ${tasaVsInflacion != null ? `
    <div class="card section" ${tasaVsInflacion < 0 ? 'style="border-color:var(--color-warning, #d97706)"' : ''}>
      <h3 class="card__title"><span class="card__title-icon">🏦</span> Tus pesos vs la inflación</h3>
      <div class="dashboard-grid">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">${propiaMensual != null ? 'LA TASA QUE TE PAGAN' : 'MEJOR TASA DEL MERCADO (PLAZO FIJO)'}</div>
          <div style="font-size:var(--font-size-xl);font-weight:800">${formatPercent(tasaUsada, 2)} <span style="font-size:var(--font-size-sm);font-weight:500" class="text-muted">mensual · ${formatPercent(propiaMensual != null ? tnaPropia : tasa.mejor.tna, 1)} TNA</span></div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${propiaMensual != null
            ? `Mejor del mercado: ${formatPercent(mejorMensual, 2)}/mes (${tasa.mejor.entidad})`
            : `${tasa.mejor.entidad} · promedio del mercado ${formatPercent(tnaAMensual(tasa.promedioTNA), 2)}/mes · <em>cargá tu tasa en Configuración</em>`}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">CONTRA LA INFLACIÓN DEL ÚLTIMO MES (${formatPercent(inflUltimoMensual)})</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:${tasaVsInflacion >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${tasaVsInflacion >= 0 ? '+' : ''}${formatPercent(tasaVsInflacion, 2)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${tasaVsInflacion >= 0 ? 'Le gana a los precios: tus pesos mantienen valor ✓' : 'Pierde contra los precios: tus pesos se licúan mes a mes'}</div>
        </div>
        ${pesosEnRiesgo > 0 ? `
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">IMPACTO REAL EN TUS ${formatARS(pesosEnRiesgo)}</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:${(impactoMensualPesos || 0) >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${(impactoMensualPesos || 0) >= 0 ? '+' : ''}${formatARS(impactoMensualPesos)}/mes</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${(impactoMensualPesos || 0) >= 0 ? 'ganás poder de compra' : 'perdés poder de compra todos los meses'}${impactoMensualPesos != null ? ` · ${formatARS(Math.abs(impactoMensualPesos) * 12)}/año` : ''}</div>
        </div>` : ''}
      </div>
      ${vsMejor != null && vsMejor < -0.05 && pesosEnRiesgo > 0 ? `
        <div style="margin-top:var(--space-3);padding:var(--space-2) var(--space-3);border-radius:var(--radius-sm);background:var(--color-warning-bg, rgba(217,119,6,.12));border:1px solid var(--color-warning-text, #d97706);font-size:var(--font-size-xs);color:var(--color-text-secondary)">
          Estás <strong>${formatPercent(Math.abs(vsMejor), 2)}/mes</strong> por debajo de la mejor tasa disponible. Sobre ${formatARS(pesosEnRiesgo)} eso es <strong>${formatARS(Math.abs(costoNoMoverse))}/mes</strong> (${formatARS(Math.abs(costoNoMoverse) * 12)} al año) que dejás de ganar por la comodidad de tenerlos donde están.
        </div>` : ''}
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Referencia: mejor plazo fijo minorista publicado por el BCRA. Tu tasa se edita en Configuración → Tus pesos.</div>
    </div>` : ''}

    <!-- Tus dólares vs la inflación de EE.UU. -->
    ${tnaUSD != null && inflUSAAnualizada != null ? `
    <div class="card section" ${usdVsInflacion < 0 ? 'style="border-color:var(--color-warning, #d97706)"' : ''}>
      <h3 class="card__title"><span class="card__title-icon">💵</span> Tus dólares vs la inflación de EE.UU.</h3>
      <div class="dashboard-grid">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">TE PAGAN POR TUS DÓLARES</div>
          <div style="font-size:var(--font-size-xl);font-weight:800">${formatPercent(tnaUSD)} <span style="font-size:var(--font-size-sm);font-weight:500" class="text-muted">anual</span></div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">INFLACIÓN EE.UU. ANUALIZADA</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:${usdVsInflacion >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${usdVsInflacion >= 0 ? '+' : ''}${formatPercent(usdVsInflacion)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">contra ${formatPercent(inflUSAAnualizada)} de inflación · ${usdVsInflacion >= 0 ? 'tus dólares ganan poder de compra ✓' : 'tus dólares pierden poder de compra'}</div>
        </div>
        ${dolaresEnCartera > 0 ? `
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">SOBRE TUS ${formatUSD(dolaresEnCartera, false)}</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:${(impactoAnualUSD || 0) >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${(impactoAnualUSD || 0) >= 0 ? '+' : ''}${formatUSD(impactoAnualUSD)}/año</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">en poder de compra real</div>
        </div>` : ''}
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Tener dólares te cubre de la inflación argentina, pero el dólar también pierde valor. Editá tu tasa en Configuración → Tus pesos.</div>
    </div>` : ''}

    <!-- Renta pasiva: dividendos, cupones e intereses -->
    ${renta.totalAnual > 0 ? `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🌱</span> Renta pasiva de tu cartera</h3>
      <div class="dashboard-grid">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">COBRADO EN ${año}</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-success-text)">${formatARS(renta.totalAnual)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${formatARS(renta.promedioMensual)}/mes promedio · ${renta.mesesConRenta} mes(es) con cobro</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">RENDIMIENTO SOBRE LO INVERTIDO</div>
          <div style="font-size:var(--font-size-xl);font-weight:800">${formatPercent(renta.yieldAnual)} <span style="font-size:var(--font-size-sm);font-weight:500" class="text-muted">anual</span></div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">proyectando ${formatARS(renta.proyeccionAnual)}/año sobre ${formatARS(invertidoARS)}</div>
        </div>
        ${coberturaGastos != null ? `
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">CUBRE DE TUS GASTOS</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-info-text)">${formatPercent(coberturaGastos)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">de tu gasto mensual promedio (${formatARS(gastoMensualProm)})</div>
        </div>` : ''}
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
        Suma los ingresos cuyo nombre incluya "dividendo", "cupón", "renta" o "interés". Es la parte de tus ingresos que no depende de tus horas: el número que mide el avance hacia vivir de la cartera.
      </div>
    </div>` : `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🌱</span> Renta pasiva de tu cartera</h3>
      <div class="text-muted" style="font-size:var(--font-size-sm)">
        Todavía no registraste dividendos ni rentas. Cargalos como un ingreso más en la vista Mes con un nombre que incluya <strong>"Dividendos"</strong> (ej: "Dividendos Bull Market") y acá vas a ver cuánto rinde tu cartera por año y qué porcentaje de tus gastos cubre.
      </div>
    </div>`}

    <!-- Dólar caro o barato (CCL ajustado por inflación) -->
    ${dolarReal ? `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">⚖️</span> ¿El dólar está caro o barato?</h3>
      <div class="dashboard-grid" style="margin-bottom:var(--space-3)">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">CCL HOY</div>
          <div style="font-size:var(--font-size-xl);font-weight:800">${formatARS(dolarReal.cclHoy)}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">PROMEDIO REAL ÚLTIMOS ${Math.round(dolarReal.meses / 12)} AÑOS (EN PESOS DE HOY)</div>
          <div style="font-size:var(--font-size-xl);font-weight:800">${formatARS(dolarReal.promedio)}</div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">DESVÍO</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:${dolarReal.desvioPct > 10 ? 'var(--color-danger-text)' : dolarReal.desvioPct < -10 ? 'var(--color-success-text)' : 'var(--color-text)'}">${dolarReal.desvioPct >= 0 ? '+' : ''}${formatPercent(dolarReal.desvioPct)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${dolarReal.desvioPct > 10 ? 'CARO en términos históricos: dolarizar hoy es menos conveniente' : dolarReal.desvioPct < -10 ? 'BARATO en términos históricos: históricamente fue buen momento para dolarizar' : 'En su promedio histórico: ni caro ni barato'}</div>
        </div>
      </div>
      <div class="chart-container" style="height:240px"><canvas id="chart-dolar-real"></canvas></div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Cada punto es el CCL de ese mes actualizado a pesos de hoy (por inflación argentina, descontando la de EE.UU.). La línea punteada es el CCL actual. No es una recomendación: el dólar puede seguir barato o caro mucho tiempo.</div>
    </div>` : ''}

    <!-- Brecha cambiaria -->
    ${brechaPct != null ? `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📐</span> Brecha cambiaria</h3>
      <div style="display:flex;align-items:baseline;gap:var(--space-4);flex-wrap:wrap">
        <div style="font-size:var(--font-size-2xl);font-weight:800;color:${brechaPct > 40 ? 'var(--color-danger-text)' : brechaPct > 20 ? 'var(--color-warning-text, #d97706)' : 'var(--color-success-text)'}">${formatPercent(brechaPct)}</div>
        <div style="font-size:var(--font-size-sm)" class="text-muted">Oficial ${formatARS(oficial)} · CCL ${formatARS(cclActual)}</div>
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">${brechaPct > 40 ? 'Brecha alta: mayor presión y riesgo de salto devaluatorio.' : brechaPct > 20 ? 'Brecha moderada: hay tensión cambiaria.' : 'Brecha baja: el mercado no descuenta un salto inminente.'} Con brecha chica conviene mirar más el rendimiento; con brecha grande, la cobertura.</div>
    </div>` : ''}

    <!-- Riesgo país: serie de los últimos 24 meses -->
    ${riesgo.serie.length > 1 ? `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🇦🇷</span> Riesgo país (últimos ${riesgo.serie.length} meses)</h3>
      <div class="chart-container" style="height:240px"><canvas id="chart-riesgo"></canvas></div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Referencia rápida: debajo de ~500 pb Argentina puede refinanciar deuda y los bonos en USD valen más; arriba de ~1000 pb es zona de estrés. Es el termómetro de tus CEDEARs/Bonos y ONs en dólares.</div>
    </div>` : ''}

    <!-- F4: Evolución de Cartera + Rendimiento real -->
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📊</span> Evolución de Cartera</h3>
      ${snapshots.length > 0 ? `
        <div class="chart-container" style="height:300px"><canvas id="chart-cartera-evol"></canvas></div>
        <div class="annual-table-wrap" style="margin-top:var(--space-4)">
          <table class="data-table">
            <thead><tr>
              <th>Mes</th>
              <th class="text-right">Total ARS</th>
              <th class="text-right">Total USD</th>
              <th class="text-right">Δ ARS</th>
              <th class="text-right" title="Plata nueva que entró a la cartera desde la categoría Inversión">Aportes</th>
              <th class="text-right" title="Δ del mes − aportes: cuánto rindió lo invertido">Rendimiento</th>
              <th class="text-right">Rend. %</th>
              <th class="text-right" title="Rendimiento medido en dólares (Δ USD − aportes en USD)">Rend. USD</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${returns.map(e => {
                const deltaColor = e.deltaARS >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
                const arrow = e.deltaARS > 0 ? '▲' : e.deltaARS < 0 ? '▼' : '—';
                const mesCap = e.mesId.charAt(0).toUpperCase() + e.mesId.slice(1);
                const rColor = e.rendimientoARS == null ? 'var(--color-text-muted)' : e.rendimientoARS >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
                return `<tr>
                  <td style="font-weight:600">${mesCap}</td>
                  <td class="text-right" style="font-weight:600">${formatARS(e.granTotalARS)}</td>
                  <td class="text-right" style="color:var(--color-info-text)">${formatUSD(e.granTotalUSD)}</td>
                  <td class="text-right" style="color:${deltaColor}">${arrow} ${formatARS(Math.abs(e.deltaARS))}</td>
                  <td class="text-right" style="color:var(--color-capital-text)">${e.aportesARS ? formatARS(e.aportesARS) : '—'}</td>
                  <td class="text-right" style="color:${rColor};font-weight:600">${e.rendimientoARS != null ? formatARS(e.rendimientoARS) : '—'}</td>
                  <td class="text-right" style="color:${rColor}">${e.rendimientoPct != null ? formatPercent(e.rendimientoPct) : '—'}</td>
                  <td class="text-right" style="color:${e.rendimientoUSD == null ? 'var(--color-text-muted)' : e.rendimientoUSD >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${e.rendimientoUSD != null ? formatUSD(e.rendimientoUSD) : '—'}</td>
                  <td class="text-right"><button class="row-delete btn-del-snap" data-id="${e.id}" data-mes="${mesCap}" title="Borrar snapshot">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
          Rendimiento = lo que creció tu cartera en el mes descontando la plata nueva que aportaste. El snapshot del mes en curso se actualiza solo cada vez que abrís la app. El primer mes no tiene rendimiento porque no hay mes anterior para comparar.
        </div>
      ` : `
        <div class="empty-state" style="padding:var(--space-6) 0">
          <div class="empty-state__icon">📸</div>
          <div class="empty-state__text">No hay snapshots de cartera.</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Se guardan solos al abrir la app (si tu cartera tiene montos cargados).</div>
        </div>
      `}
    </div>

    <!-- Benchmark: tu cartera vs el S&P 500 -->
    ${conBenchmark.length ? `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🏁</span> Tu cartera vs el S&P 500</h3>
      <div class="annual-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Mes</th>
            <th class="text-right" title="Rendimiento propio medido en dólares">Tu cartera (USD)</th>
            <th class="text-right">S&P 500</th>
            <th class="text-right" title="Diferencia: cuánto le ganaste o perdiste al índice">Diferencia</th>
          </tr></thead>
          <tbody>
            ${conBenchmark.map(b => {
              const mesCap = b.mesId.charAt(0).toUpperCase() + b.mesId.slice(1);
              const cPropio = b.propioPctUSD >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
              const cSpy = b.spyPct >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
              const cAlfa = b.alfa >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
              return `<tr>
                <td style="font-weight:600">${mesCap}</td>
                <td class="text-right" style="color:${cPropio};font-weight:600">${b.propioPctUSD >= 0 ? '+' : ''}${formatPercent(b.propioPctUSD, 2)}</td>
                <td class="text-right" style="color:${cSpy}">${b.spyPct >= 0 ? '+' : ''}${formatPercent(b.spyPct, 2)}</td>
                <td class="text-right" style="color:${cAlfa};font-weight:700">${b.alfa >= 0 ? '▲ +' : '▼ '}${formatPercent(b.alfa, 2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="chart-container" style="height:240px;margin-top:var(--space-4)"><canvas id="chart-benchmark"></canvas></div>
      <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
        Compara el rendimiento de TU cartera en dólares (sin contar los aportes) contra lo que hubiera hecho el S&P 500 (ETF SPY) en el mismo mes. Diferencia positiva = tu selección le ganó al índice. Necesita snapshots de meses consecutivos y que mantengas actualizados los valores de mercado en Configuración.
      </div>
    </div>` : ''}

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📋</span> Detalle Ahorro por Mes</h3>
      <div class="annual-table-wrap">
        <table class="data-table"><thead><tr>
          <th>Mes</th><th class="text-right">Ahorro del mes</th><th class="text-right">Acumulado ARS</th><th class="text-right">Acumulado USD</th>
        </tr></thead><tbody>
          ${ahorro.map((a, i) => `<tr>
            <td style="font-weight:600">${MESES_SHORT[i]}</td>
            <td class="text-right ${a.ahorroMes >= 0 ? 'text-success' : 'text-danger'}">${formatARS(a.ahorroMes)}</td>
            <td class="text-right" style="font-weight:600">${formatARS(a.acumulado)}</td>
            <td class="text-right" style="color:var(--color-info-text)">${formatUSD(a.acumuladoUSD)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>
  `;

  // Borrar un snapshot puntual (con confirmación) y re-renderizar la pestaña.
  panel.querySelectorAll('.btn-del-snap').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, mes } = btn.dataset;
      if (!confirm(`¿Borrar el snapshot de ${mes}? Esta acción no se puede deshacer.`)) return;
      try {
        await deletePortfolioSnapshot(id);
        showToast(`Snapshot de ${mes} borrado`, 'success');
        Object.values(chartInstances).forEach(c => c?.destroy?.());
        renderTabPatrimonio(panel);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });

  // Charts
  import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    const { fontColor, gridColor, colors, options } = getChartDefaults();

    // Acumulado
    const ctx1 = document.getElementById('chart-ahorro-acum')?.getContext('2d');
    if (ctx1) {
      chartInstances.ahorroAcum = new Chart(ctx1, {
        type: 'line',
        data: { labels: MESES_SHORT, datasets: [
          { label: 'Acumulado ARS', data: ahorro.map(a => a.acumulado), borderColor: colors[2], backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y' },
          { label: 'Acumulado USD', data: ahorro.map(a => a.acumuladoUSD), borderColor: colors[1], borderDash: [5,5], tension: 0.3, pointRadius: 3, yAxisID: 'y1' }
        ] },
        options: { ...options, scales: {
          x: { ticks: { color: fontColor }, grid: { display: false } },
          y: { type: 'linear', position: 'left', ticks: { color: fontColor }, grid: { color: gridColor } },
          y1: { type: 'linear', position: 'right', ticks: { color: colors[1] }, grid: { display: false } }
        } }
      });
    }

    // Barras mensuales
    const ctx2 = document.getElementById('chart-ahorro-mensual')?.getContext('2d');
    if (ctx2) {
      const barColors = ahorro.map(a => a.ahorroMes >= 0 ? colors[2] + '99' : colors[4] + '99');
      chartInstances.ahorroMensual = new Chart(ctx2, {
        type: 'bar',
        data: { labels: MESES_SHORT, datasets: [{ label: 'Ahorro mensual', data: ahorro.map(a => a.ahorroMes), backgroundColor: barColors, borderRadius: 6 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }

    // Inflación: barras mensuales + acumulada vs dólar acumulado
    if (inflAcumTotal != null) {
      const ctxI = document.getElementById('chart-inflacion')?.getContext('2d');
      if (ctxI) {
        chartInstances.inflacion = new Chart(ctxI, {
          data: {
            labels: MESES_SHORT,
            datasets: [
              { type: 'bar', label: 'Inflación mensual %', data: inflMensual, backgroundColor: colors[4] + '99', borderColor: colors[4], borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
              { type: 'line', label: 'Inflación acumulada %', data: inflAcum, borderColor: colors[3], backgroundColor: colors[3] + '20', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y1' },
              { type: 'line', label: 'Dólar CCL acumulado %', data: dolarAcum, borderColor: colors[1], borderDash: [6, 4], tension: 0.3, pointRadius: 3, yAxisID: 'y1' },
              { type: 'line', label: 'Inflación EE.UU. acumulada %', data: inflUSAAcum, borderColor: colors[2], borderDash: [2, 3], tension: 0.3, pointRadius: 2, borderWidth: 1.5, yAxisID: 'y1' },
            ]
          },
          options: { ...options, scales: {
            x: { ticks: { color: fontColor }, grid: { display: false } },
            y: { position: 'left', ticks: { color: colors[4] }, grid: { color: gridColor }, title: { display: true, text: '% mensual', color: fontColor, font: { size: 10 } } },
            y1: { position: 'right', ticks: { color: fontColor }, grid: { display: false }, title: { display: true, text: '% acumulado', color: fontColor, font: { size: 10 } } }
          } }
        });
      }
    }

    // Dólar real: CCL histórico traído a pesos de hoy vs CCL actual
    if (dolarReal) {
      const ctxD = document.getElementById('chart-dolar-real')?.getContext('2d');
      if (ctxD) {
        chartInstances.dolarReal = new Chart(ctxD, {
          type: 'line',
          data: {
            labels: dolarReal.serieReal.map(d => d.mes.slice(2)),
            datasets: [
              { label: 'CCL en pesos de hoy', data: dolarReal.serieReal.map(d => d.real), borderColor: colors[3], backgroundColor: colors[3] + '20', fill: true, tension: 0.3, pointRadius: 2 },
              { label: 'CCL actual', data: dolarReal.serieReal.map(() => dolarReal.cclHoy), borderColor: colors[4], borderDash: [6, 4], borderWidth: 2, pointRadius: 0 },
              { label: 'Promedio histórico real', data: dolarReal.serieReal.map(() => dolarReal.promedio), borderColor: colors[10], borderDash: [2, 3], borderWidth: 1.5, pointRadius: 0 },
            ]
          },
          options: { ...options, scales: { x: { ticks: { color: fontColor, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
        });
      }
    }

    // Benchmark: barras cartera vs S&P 500
    if (conBenchmark.length) {
      const ctxB = document.getElementById('chart-benchmark')?.getContext('2d');
      if (ctxB) {
        chartInstances.benchmark = new Chart(ctxB, {
          type: 'bar',
          data: {
            labels: conBenchmark.map(b => b.mesId.charAt(0).toUpperCase() + b.mesId.slice(1, 3)),
            datasets: [
              { label: 'Tu cartera (USD) %', data: conBenchmark.map(b => b.propioPctUSD), backgroundColor: colors[0] + '99', borderColor: colors[0], borderWidth: 1, borderRadius: 4 },
              { label: 'S&P 500 %', data: conBenchmark.map(b => b.spyPct), backgroundColor: colors[3] + '99', borderColor: colors[3], borderWidth: 1, borderRadius: 4 },
            ]
          },
          options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor, callback: (v) => v + '%' }, grid: { color: gridColor } } } }
        });
      }
    }

    // Riesgo país: línea de los últimos meses
    if (riesgo.serie.length > 1) {
      const ctxR = document.getElementById('chart-riesgo')?.getContext('2d');
      if (ctxR) {
        chartInstances.riesgo = new Chart(ctxR, {
          type: 'line',
          data: {
            labels: riesgo.serie.map(d => d.fecha.slice(2, 7)), // 'YY-MM'
            datasets: [{ label: 'Riesgo país (pb)', data: riesgo.serie.map(d => d.valor), borderColor: colors[7], backgroundColor: colors[7] + '20', fill: true, tension: 0.3, pointRadius: 3 }]
          },
          options: { ...options, scales: { x: { ticks: { color: fontColor, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
        });
      }
    }

    // F4: Evolución de cartera chart
    if (snapshots.length > 0) {
      const ctx3 = document.getElementById('chart-cartera-evol')?.getContext('2d');
      if (ctx3) {
        const labels = evolution.map(e => e.mesId.charAt(0).toUpperCase() + e.mesId.slice(1, 3));
        chartInstances.carteraEvol = new Chart(ctx3, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Total ARS', data: evolution.map(e => e.granTotalARS), borderColor: colors[0], backgroundColor: colors[0] + '15', fill: true, tension: 0.3, pointRadius: 5, borderWidth: 2.5, yAxisID: 'y' },
              { label: 'Total USD', data: evolution.map(e => e.granTotalUSD), borderColor: colors[1], borderDash: [5, 5], tension: 0.3, pointRadius: 3, borderWidth: 1.5, yAxisID: 'y1' },
              { label: 'Liquidez ARS', data: evolution.map(e => e.liquidezARS), borderColor: colors[2], tension: 0.3, pointRadius: 3, borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y' },
              { label: 'Inversiones ARS', data: evolution.map(e => e.inversionesARS), borderColor: colors[5], tension: 0.3, pointRadius: 3, borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y' },
            ]
          },
          options: { ...options, scales: {
            x: { ticks: { color: fontColor }, grid: { display: false } },
            y: { type: 'linear', position: 'left', ticks: { color: fontColor }, grid: { color: gridColor } },
            y1: { type: 'linear', position: 'right', ticks: { color: colors[1] }, grid: { display: false } }
          } }
        });
      }
    }
  }).catch(e => console.error('Chart.js error:', e));
}
