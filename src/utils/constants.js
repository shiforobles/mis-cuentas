/**
 * MIS CUENTAS — Constantes globales
 * Meses, categorías de egreso, distribución ideal, ítems plantilla
 */

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export const MESES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MESES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

/**
 * Categorías de egreso (10 fijas con ítems plantilla).
 * Cada categoría tiene un id numérico, nombre, y lista de ítems con montos proyectados.
 */
export const CATEGORIAS_EGRESO = [
  {
    id: 1,
    nombre: 'Hogar y Facturas',
    icon: '🏠',
    items: [
      { descripcion: 'Alquiler', proyectado: 500000 },
      { descripcion: 'Expensas', proyectado: 300000 },
      { descripcion: 'Agua AYSA', proyectado: 26562 },
      { descripcion: 'Gas Metrogas', proyectado: 20000 },
      { descripcion: 'Luz Edesur', proyectado: 20000 },
      { descripcion: 'Internet Personal Flow', proyectado: 33609 },
      { descripcion: 'Celular Personal', proyectado: 30000 },
      { descripcion: 'Alimentación Hogar', proyectado: 300000 },
      { descripcion: 'AFIP', proyectado: 110000 },
    ]
  },
  {
    id: 2,
    nombre: 'Transporte',
    icon: '🚗',
    items: [
      { descripcion: 'Uber + Taxis', proyectado: 200000 },
      { descripcion: 'SUBE', proyectado: 10000 },
    ]
  },
  {
    id: 3,
    nombre: 'Productividad',
    icon: '💻',
    items: []
  },
  {
    id: 4,
    nombre: 'Crecimiento Personal',
    icon: '📚',
    items: [
      { descripcion: 'Curso Ecotransesofágico SAC 2026', proyectado: 0 },
    ]
  },
  {
    id: 5,
    nombre: 'Calidad de Vida',
    icon: '❤️',
    items: [
      { descripcion: 'Gimnasio', proyectado: 40000 },
      { descripcion: 'Farmacia', proyectado: 100000 },
      { descripcion: 'Sancord Salud VISA', proyectado: 230000 },
    ]
  },
  {
    id: 6,
    nombre: 'Bienestar',
    icon: '✨',
    items: [
      { descripcion: 'Viaje', proyectado: 0 },
      { descripcion: 'Compras ropa', proyectado: 0 },
      { descripcion: 'Peluquería y cuidado personal', proyectado: 0 },
      { descripcion: 'Almuerzo/salidas', proyectado: 150000 },
    ]
  },
  {
    id: 7,
    nombre: 'Deudas',
    icon: '💳',
    items: [
      { descripcion: 'Cuota Tarjeta BBVA VISA', proyectado: 600000 },
      { descripcion: 'Cuota Tarjeta BBVA Mastercard', proyectado: 0 },
    ]
  },
  {
    id: 8,
    nombre: 'Inversión',
    icon: '📈',
    items: [
      { descripcion: 'Dólar MEP', proyectado: 0 },
      { descripcion: 'Criptomonedas', proyectado: 0 },
      { descripcion: 'CEDEARS/Bonos', proyectado: 0 },
    ]
  },
  {
    id: 9,
    nombre: 'Generosidad',
    icon: '🤝',
    items: [
      { descripcion: 'Aporte ayuda Familia', proyectado: 0 },
      { descripcion: 'Regalos', proyectado: 0 },
    ]
  },
  {
    id: 10,
    nombre: 'Otros',
    icon: '📦',
    items: [
      { descripcion: 'Gastos cenas del Hospital', proyectado: 0 },
      { descripcion: 'Gastos mensuales Hospital', proyectado: 0 },
      { descripcion: 'Recitales', proyectado: 0 },
    ]
  }
];

/**
 * Distribución ideal (% objetivo por categoría).
 * Las keys son los IDs de categoría.
 * "Inversión" (cat 8) mapea contra "Ahorro" (20%).
 */
export const DISTRIBUCION_IDEAL = {
  1: { nombre: 'Hogar', percent: 30 },
  2: { nombre: 'Transporte', percent: 2 },
  3: { nombre: 'Productividad', percent: 5 },
  4: { nombre: 'Crecimiento Personal', percent: 10 },
  5: { nombre: 'Calidad de Vida', percent: 5 },
  6: { nombre: 'Bienestar', percent: 5 },
  7: { nombre: 'Deudas', percent: 10 },
  8: { nombre: 'Ahorro/Inversión', percent: 20 },
  9: { nombre: 'Generosidad', percent: 0 },
  10: { nombre: 'Otros', percent: 5 },
};

/**
 * Ítems de ingreso plantilla (precargados para cada mes).
 */
export const INGRESOS_PLANTILLA = [
  { descripcion: 'Guardia UCO', proyectado: 1000000, horasSemanales: '24hs', horasMensuales: '96hs' },
  { descripcion: 'Consultorio HEBA', proyectado: 210000, horasSemanales: '3hs', horasMensuales: '12hs' },
  { descripcion: 'Ecocardio HEBA x2', proyectado: 500000, horasSemanales: '8hs', horasMensuales: '32hs' },
  { descripcion: 'Eco OSECAC x2', proyectado: 650000, horasSemanales: '10hs', horasMensuales: '40hs' },
  { descripcion: 'Bioimágenes x2', proyectado: 1900000, horasSemanales: '9,5hs', horasMensuales: '38hs' },
];

/**
 * Cartera vacía por defecto
 */
export const CARTERA_DEFAULT = {
  id: 'current',
  fecha: new Date().toISOString().slice(0, 10),
  liquidez: {
    fondoEmergencia: { monto: 0, moneda: 'ARS', label: 'Fondo de Emergencia' },
    pasiva: { monto: 0, moneda: 'ARS', label: 'Liquidez Pasiva', detalle: 'NaranjaX' },
    activa: { monto: 0, moneda: 'ARS', label: 'Liquidez Activa', detalle: 'MercadoLibre' },
    usdBilletes: { monto: 0, moneda: 'USD', label: 'USD Billetes' },
    usdMEP: { monto: 0, moneda: 'USD', label: 'USD MEP' },
    usdt: { monto: 0, moneda: 'USD', label: 'USDT' },
    resto: { monto: 0, moneda: 'USD', label: 'Resto' },
  },
  inversiones: {
    cedears: { monto: 0, moneda: 'ARS', label: 'Acciones / CEDEARs' },
    bonos: { monto: 0, moneda: 'ARS', label: 'Bonos / ON' },
    cripto: { monto: 0, moneda: 'ARS', label: 'Cripto' },
  },
  // Asignación objetivo para la alerta de rebalanceo.
  // inversionesPct = 100 - liquidezPct ; arsPct = 100 - usdPct
  targets: { liquidezPct: 30, usdPct: 50 },
  // Concepto de liquidez que cuenta como fondo de emergencia (cobertura en meses).
  emergenciaKey: 'fondoEmergencia',
};

/** Año por defecto */
export const AÑO_DEFAULT = 2026;

/** Rutas de navegación */
export const ROUTES = {
  QUICK_ADD: 'quick-add',
  DASHBOARD: 'dashboard',
  MONTHLY: 'mes',
  SETTINGS: 'config',
  SEARCH: 'buscar',
  COMPARE: 'comparar',
};

/**
 * Compone la clave de un mes en la DB: "mayo-2026"
 * @param {string} mesId - ej: 'mayo'
 * @param {number} año - ej: 2026
 * @returns {string}
 */
export function mesKey(mesId, año) {
  return `${mesId}-${año}`;
}

/**
 * Descompone una clave de mes: "mayo-2026" → { mesId: 'mayo', año: 2026 }
 * @param {string} key
 * @returns {{ mesId: string, año: number }}
 */
export function parseMesKey(key) {
  if (!key) return { mesId: '', año: AÑO_DEFAULT };
  const match = key.match(/^(.+)-(\d{4})$/);
  if (match) {
    return { mesId: match[1], año: parseInt(match[2]) };
  }
  // Fallback for old format (just month name)
  return { mesId: key, año: AÑO_DEFAULT };
}

/**
 * Cantidad de meses "visibles" (transcurridos) para un año dado, contra la
 * fecha de hoy. Sirve para no contar/mostrar meses que todavía no llegaron.
 *  - Año actual  → meses hasta el actual inclusive (1–12). Ej: junio → 6.
 *  - Años pasados → 12 (el año entero ya transcurrió).
 *  - Años futuros → 0.
 * @param {number} año
 * @returns {number} 0–12
 */
export function mesesTranscurridos(año) {
  const hoy = new Date();
  const añoActual = hoy.getFullYear();
  if (año < añoActual) return 12;
  if (año > añoActual) return 0;
  return hoy.getMonth() + 1; // getMonth() es 0-based → +1 incluye el mes actual
}

/** Pestañas del dashboard */
export const DASHBOARD_TABS = [
  { id: 'ingresos', label: 'Ingresos', icon: '💰' },
  { id: 'cartera', label: 'Cartera', icon: '💼' },
  { id: 'gastos', label: 'Gastos', icon: '💸' },
  { id: 'patrimonio', label: 'Patrimonio', icon: '📈' },
];
