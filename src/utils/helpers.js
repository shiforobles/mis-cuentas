/**
 * MIS CUENTAS — Utilidades del DOM y helpers generales
 */

/**
 * Atajo para querySelector
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {Element|null}
 */
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Atajo para querySelectorAll
 * @param {string} selector
 * @param {Element} [parent=document]
 * @returns {NodeListOf<Element>}
 */
export function $$(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

/**
 * Crea un elemento HTML con propiedades
 * @param {string} tag
 * @param {Object} [props]
 * @param {(string|Element)[]} [children]
 * @returns {HTMLElement}
 */
export function createElement(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'innerHTML') {
      el.innerHTML = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  
  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }
  
  return el;
}

/**
 * Debounce: retrasa la ejecución de fn hasta que pasen ms sin ser invocada.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Genera un ID único (pseudo-random).
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Escapa un string para insertarlo de forma segura en HTML
 * (texto o valores de atributo). Evita romper el markup y XSS
 * cuando el contenido es editable por el usuario.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Muestra un toast de notificación.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='success']
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  
  const toast = createElement('div', {
    className: `toast toast--${type}`,
    innerHTML: `<span>${icons[type] || ''}</span> ${message}`
  });
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

/**
 * Limpia el contenido de un elemento.
 * @param {Element} el
 */
export function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Deep clone de un objeto (structuredClone polyfill seguro).
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}
