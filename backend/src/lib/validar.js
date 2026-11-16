import { invalido } from './errores.js';

export const texto = (v, campo, { min = 1, max = 255, opcional = false } = {}) => {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (opcional) return null;
    throw invalido(`El campo «${campo}» es obligatorio.`, { campo });
  }
  const s = String(v).trim();
  if (s.length < min || s.length > max) throw invalido(`«${campo}» debe tener entre ${min} y ${max} caracteres.`, { campo });
  return s;
};

export const entero = (v, campo, { min = -Infinity, max = Infinity, opcional = false } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (opcional) return null;
    throw invalido(`El campo «${campo}» es obligatorio.`, { campo });
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw invalido(`«${campo}» debe ser un número entero entre ${min} y ${max}.`, { campo });
  return n;
};

export const email = (v, campo = 'correo') => {
  const s = texto(v, campo, { max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw invalido('Escribe un correo válido, por ejemplo 20231458@aula.edu.pe.', { campo });
  return s;
};

export const isbn = v => {
  const s = texto(v, 'ISBN', { max: 20 });
  const d = s.replace(/-/g, '');
  if (!/^(\d{9}[\dXx]|\d{13})$/.test(d)) throw invalido('El ISBN debe tener 10 o 13 dígitos (los guiones son opcionales).', { campo: 'isbn' });
  return s.toUpperCase();
};

export const url = (v, campo) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (!/^https?:\/\/\S+$/i.test(s) || s.length > 2000) throw invalido(`«${campo}» debe ser una URL que empiece con http:// o https://.`, { campo });
  return s;
};

export const uno = (v, campo, opciones) => {
  if (!opciones.includes(v)) throw invalido(`«${campo}» debe ser uno de: ${opciones.join(', ')}.`, { campo });
  return v;
};

export const listaIds = (v, campo) => {
  if (!Array.isArray(v)) throw invalido(`«${campo}» debe ser una lista.`, { campo });
  return v.map(x => entero(x, campo, { min: 1 }));
};

export const esUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
