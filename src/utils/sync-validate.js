/**
 * MIS CUENTAS — Validación de forma de registros.
 * Compartido por la sincronización (push/pull) y la importación de JSON, para
 * que ningún dato con estructura inválida entre a un store equivocado y corrompa
 * los datos buenos (p.ej. la distribución ideal de `config` metida como ingresos
 * de `months`, o descripciones reemplazadas por números).
 */

/**
 * Valida que un registro tenga la FORMA esperada para su store.
 * @param {string} store - 'config' | 'months' | 'portfolio' | 'portfolioHistory' | 'transactions' | 'recurring'
 * @param {any} data - el registro
 * @param {string} [id] - clave esperada (para detectar cruces de id)
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateForStore(store, data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'data no es un objeto' };
  }
  // El id embebido debe coincidir con la clave (atrapa cruces entre registros).
  if (data.id != null && id != null && String(data.id) !== String(id)) {
    return { ok: false, reason: `id embebido (${data.id}) ≠ id de fila (${id})` };
  }
  switch (store) {
    case 'config':
      if ((id ?? data.id) !== 'global') return { ok: false, reason: `config con id inesperado: ${id ?? data.id}` };
      break;
    case 'months': {
      if (!Array.isArray(data.ingresos)) return { ok: false, reason: 'months sin ingresos[]' };
      if (!data.egresos || typeof data.egresos !== 'object' || Array.isArray(data.egresos)) {
        return { ok: false, reason: 'months sin egresos{}' };
      }
      // Cada ingreso debe ser un objeto con descripcion de TIPO TEXTO. Atrapa
      // números sueltos (distribución ideal filtrada) y descripciones
      // reemplazadas por números (corrimiento de campos de una planilla).
      const ingOk = data.ingresos.every(it => it && typeof it === 'object' && typeof it.descripcion === 'string');
      if (!ingOk) return { ok: false, reason: 'ingresos con descripcion no-texto (datos corridos/mal formados)' };
      break;
    }
    case 'portfolio':
      if (!data.liquidez || !data.inversiones) return { ok: false, reason: 'portfolio sin liquidez/inversiones' };
      break;
    case 'transactions':
      if (typeof data.amount !== 'number' || !data.itemId) return { ok: false, reason: 'transacción sin amount/itemId' };
      break;
    // portfolioHistory / recurring: con que sea objeto alcanza.
    default:
      break;
  }
  return { ok: true };
}
