/**
 * MIS CUENTAS — Seed (datos iniciales)
 * Carga datos por defecto la primera vez que se abre la app.
 */

import { dbGet, dbPut, dbGetAll } from './database.js';
import {
  MESES,
  CATEGORIAS_EGRESO,
  DISTRIBUCION_IDEAL,
  INGRESOS_PLANTILLA,
  CARTERA_DEFAULT,
  AÑO_DEFAULT,
  mesKey
} from '../utils/constants.js';
import { generateId, deepClone } from '../utils/helpers.js';

/**
 * Inicializa la base de datos con datos por defecto si está vacía.
 * @returns {Promise<void>}
 */
export async function seedDatabase() {
  // 1. Configuración global
  const existingConfig = await dbGet('config', 'global');
  let año = AÑO_DEFAULT;

  if (!existingConfig) {
    const config = {
      id: 'global',
      año: AÑO_DEFAULT,
      dolarCCL: 1488.8,
      dolarCCLManual: null,
      dolarCCLFechaUpdate: null,
      dolarTodas: null,
      distribucionIdeal: deepClone(DISTRIBUCION_IDEAL),
      categorias: CATEGORIAS_EGRESO.map(c => ({
        id: c.id,
        nombre: c.nombre,
        icon: c.icon,
      })),
      mapeoIdealInversion: 'ahorro',
      dolarHistorico: {},
      theme: 'dark',
      dbMigrated: 3, // New installs start at v3
    };
    await dbPut('config', config);
    console.log('✓ Config global inicializada');
  } else {
    año = existingConfig.año || AÑO_DEFAULT;
  }

  // 2. Meses (12 registros con ingresos y egresos plantilla)
  let mesesCreados = 0;
  for (const mes of MESES) {
    const key = mesKey(mes, año);
    const existingMonth = await dbGet('months', key);
    if (!existingMonth) {
      const monthData = await createMonthData(mes, año);
      await dbPut('months', monthData);
      mesesCreados++;
    }
  }
  if (mesesCreados > 0) {
    console.log(`✓ ${mesesCreados} meses inicializados para ${año}`);
  }

  // 3. Cartera
  const existingPortfolio = await dbGet('portfolio', 'current');
  if (!existingPortfolio) {
    await dbPut('portfolio', deepClone(CARTERA_DEFAULT));
    console.log('✓ Cartera inicializada');
  }
}

/**
 * Seed solo los meses de un año nuevo (al cambiar de año).
 * @param {number} nuevoAño
 */
export async function seedYear(nuevoAño) {
  let mesesCreados = 0;
  for (const mes of MESES) {
    const key = mesKey(mes, nuevoAño);
    const existing = await dbGet('months', key);
    if (!existing) {
      const monthData = await createMonthData(mes, nuevoAño);
      await dbPut('months', monthData);
      mesesCreados++;
    }
  }
  console.log(`✓ ${mesesCreados} meses inicializados para ${nuevoAño}`);
}

/**
 * Crea los datos de un mes nuevo con ítems plantilla + recurrentes.
 * @param {string} mesId - ID del mes (ej: 'enero')
 * @param {number} año
 * @returns {Promise<Object>}
 */
export async function createMonthData(mesId, año = AÑO_DEFAULT) {
  // Cargar ítems recurrentes activos
  let recurringItems = [];
  try {
    recurringItems = await dbGetAll('recurring');
    recurringItems = recurringItems.filter(r => r.activo !== false);
  } catch { /* store might not exist yet */ }

  // Ingresos: plantilla + recurrentes de tipo ingreso
  const ingresos = INGRESOS_PLANTILLA.map(item => ({
    id: generateId(),
    descripcion: item.descripcion,
    proyectado: item.proyectado,
    real: 0,
    horasSemanales: item.horasSemanales || '',
    horasMensuales: item.horasMensuales || '',
    horasTotal: item.horasTotal || '',
  }));

  // Agregar ingresos recurrentes que no estén ya en la plantilla
  const recIngreso = recurringItems.filter(r => r.tipo === 'ingreso');
  for (const rec of recIngreso) {
    const yaExiste = ingresos.some(i => i.descripcion.toLowerCase() === rec.descripcion.toLowerCase());
    if (!yaExiste) {
      ingresos.push({
        id: generateId(),
        descripcion: rec.descripcion,
        proyectado: rec.proyectado || 0,
        real: 0,
        horasSemanales: rec.horasSemanales || '',
        horasMensuales: rec.horasMensuales || '',
        horasTotal: '',
      });
    }
  }

  // Egresos organizados por categoría
  const egresos = {};
  for (const cat of CATEGORIAS_EGRESO) {
    const items = cat.items.map(item => ({
      id: generateId(),
      descripcion: item.descripcion,
      proyectado: item.proyectado,
      real: 0,
    }));

    // Agregar egresos recurrentes de esta categoría
    const recEgreso = recurringItems.filter(r => r.tipo === 'egreso' && r.categoryId === cat.id);
    for (const rec of recEgreso) {
      const yaExiste = items.some(i => i.descripcion.toLowerCase() === rec.descripcion.toLowerCase());
      if (!yaExiste) {
        items.push({
          id: generateId(),
          descripcion: rec.descripcion,
          proyectado: rec.proyectado || 0,
          real: 0,
        });
      }
    }

    egresos[cat.id] = { items };
  }

  return {
    id: mesKey(mesId, año),
    año,
    dolarCCL: null,
    ingresos,
    egresos,
  };
}
