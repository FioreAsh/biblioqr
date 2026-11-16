/**
 * Datos de demostración coherentes: cada ejemplar «reservado» o «prestado» está respaldado
 * por una reserva o un préstamo real, así el flujo completo se puede probar de inmediato.
 *   npm run seed   → siembra si la base está vacía
 *   npm run reset  → borra todo, migra y vuelve a sembrar
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, db } from './index.js';
import { migrar } from './migrate.js';

const CATEGORIAS = [
  ['Ingeniería y Sistemas', 'Software, algoritmos y bases de datos'],
  ['Ciencias Básicas', 'Matemática y álgebra'],
  ['Economía y Gestión', 'Administración y sistemas de información'],
  ['Derecho', 'Derecho informático y teoría jurídica'],
  ['Humanidades', 'Investigación y literatura'],
  ['Ciencias de la Salud', 'Fisiología y biología']
];
const PISO = { 1: ['Piso 2', 'A'], 2: ['Piso 2', 'B'], 3: ['Piso 1', 'C'], 4: ['Piso 1', 'D'], 5: ['Piso 3', 'E'], 6: ['Piso 3', 'F'] };

// est: estado inicial de cada ejemplar  d=disponible r=reservado p=prestado m=mantenimiento x=perdido
const LIBROS = [
  [1, '978-607-32-0603-7', 'Ingeniería de Software', 'Ian Sommerville', 'Pearson', 2011, 'Procesos, requisitos, diseño y pruebas de sistemas de software, con casos de ingeniería de sistemas críticos.', 'ddrp', ['software', 'ingeniería de software', 'calidad', 'sistemas de información']],
  [1, '978-0-262-04630-5', 'Introduction to Algorithms', 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein', 'MIT Press', 2022, 'Referencia sobre estructuras de datos, análisis de complejidad y diseño de algoritmos (cuarta edición).', 'dp', ['algoritmos', 'estructuras de datos', 'programación', 'matemática discreta']],
  [1, '978-0-13-235088-4', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', 2008, 'Guía práctica para escribir código legible, mantenible y fácil de probar.', 'dddm', ['programación', 'software', 'calidad', 'buenas prácticas']],
  [1, '978-84-7829-085-7', 'Fundamentos de Sistemas de Bases de Datos', 'Ramez Elmasri, Shamkant B. Navathe', 'Pearson', 2016, 'Modelo relacional, SQL, normalización y transacciones.', 'pp', ['bases de datos', 'sql', 'sistemas de información', 'modelado']],
  [2, '978-607-526-534-8', 'Cálculo de una variable', 'James Stewart', 'Cengage Learning', 2018, 'Límites, derivadas e integrales con problemas graduados por dificultad.', 'dddr', ['cálculo', 'matemática', 'análisis']],
  [2, '978-607-32-3743-7', 'Álgebra lineal y sus aplicaciones', 'David C. Lay', 'Pearson', 2016, 'Sistemas lineales, espacios vectoriales, valores propios y aplicaciones.', 'drx', ['álgebra', 'matemática', 'matrices']],
  [3, '978-607-32-3835-9', 'Sistemas de información gerencial', 'Kenneth C. Laudon, Jane P. Laudon', 'Pearson', 2016, 'Cómo las organizaciones usan los sistemas de información para decidir, competir y gestionar.', 'ddp', ['sistemas de información', 'gestión', 'organizaciones', 'bases de datos']],
  [3, '978-607-32-4017-8', 'Administración estratégica', 'Fred R. David', 'Pearson', 2017, 'Formulación, implementación y evaluación de estrategias empresariales.', 'rp', ['gestión', 'estrategia', 'organizaciones']],
  [4, '978-607-15-0241-4', 'Derecho informático', 'Julio Téllez Valdés', 'McGraw-Hill', 2009, 'Marco jurídico de la informática: protección de datos, delitos informáticos y contratación electrónica.', 'dd', ['derecho', 'informática', 'datos personales', 'sistemas de información']],
  [4, '978-970-07-3463-0', 'Introducción al estudio del derecho', 'Eduardo García Máynez', 'Porrúa', 2002, 'Conceptos fundamentales de la teoría general del derecho.', 'dpm', ['derecho', 'teoría jurídica']],
  [5, '978-1-4562-2396-0', 'Metodología de la investigación', 'Roberto Hernández Sampieri, Carlos Fernández Collado, Pilar Baptista Lucio', 'McGraw-Hill', 2014, 'Enfoques cuantitativo, cualitativo y mixto, desde el planteamiento del problema hasta el informe.', 'dddd', ['investigación', 'metodología', 'tesis']],
  [5, '978-84-204-8203-9', 'Cien años de soledad', 'Gabriel García Márquez', 'Alfaguara', 2007, 'Novela de la familia Buendía y el pueblo de Macondo.', 'ddrp', ['literatura', 'novela', 'latinoamérica']],
  [6, '978-84-9113-641-7', 'Tratado de fisiología médica', 'John E. Hall, Michael E. Hall', 'Elsevier', 2021, 'Fisiología de órganos y sistemas con orientación clínica (decimocuarta edición).', 'dm', ['fisiología', 'medicina', 'biología']],
  [6, '978-84-9835-715-4', 'Biología', 'Neil A. Campbell, Jane B. Reece', 'Pearson', 2021, 'Biología celular, genética, evolución y ecología.', 'dpp', ['biología', 'genética', 'ciencias de la vida']]
];
const CODE = { d: 'disponible', r: 'reservado', p: 'prestado', m: 'mantenimiento', x: 'perdido' };

const USUARIOS = [
  ['admin',   null,       'Lucía',   'Paredes Soto',    'admin@biblioteca.edu.pe',     'administrador'],
  ['bib',     null,       'Marcos',  'Quispe Lara',     'm.quispe@biblioteca.edu.pe',  'bibliotecario'],
  ['camila',  '20231458', 'Camila',  'Rojas Vega',      '20231458@aula.edu.pe',        'estudiante'],
  ['diego',   '20229876', 'Diego',   'Huamán Torres',   '20229876@aula.edu.pe',        'estudiante'],
  ['valeria', '20217731', 'Valeria', 'Chávez Ramos',    '20217731@aula.edu.pe',        'estudiante'],
  ['andres',  '20240512', 'Andrés',  'Salazar Medina',  '20240512@aula.edu.pe',        'estudiante'],
  ['sofia',   '20230045', 'Sofía',   'Mendoza Arce',    '20230045@aula.edu.pe',        'estudiante'],
  ['joaquin', '20221187', 'Joaquín', 'Ríos Castañeda',  '20221187@aula.edu.pe',        'estudiante']
];

const H = 3_600_000, D = 24 * H;

export async function sembrar(){
  const ahora = Date.now();
  await db.tx(async q => {
    const uid = {};
    for (const [k, cod, n, a, email, rol] of USUARIOS)
      uid[k] = (await q.query(`INSERT INTO usuarios (codigo_estudiante, nombres, apellidos, email, rol) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [cod, n, a, email, rol])).rows[0].id;

    for (const [n, d] of CATEGORIAS) await q.query('INSERT INTO categorias (nombre, descripcion) VALUES ($1,$2)', [n, d]);

    // ej[libro][estado] = cola de ids de ejemplares con ese estado
    const ej = {};
    for (let i = 0; i < LIBROS.length; i++) {
      const [cat, isbn, titulo, autor, editorial, anio, desc, est, tags] = LIBROS[i];
      const lid = (await q.query(
        `INSERT INTO libros (categoria_id, isbn, titulo, autor, editorial, anio_publicacion, descripcion, portada_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING id`, [cat, isbn, titulo, autor, editorial, anio, desc])).rows[0].id;
      for (const t of tags) {
        const tid = (await q.query(`INSERT INTO etiquetas (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`, [t])).rows[0].id;
        await q.query('INSERT INTO libro_etiquetas (libro_id, etiqueta_id) VALUES ($1,$2)', [lid, tid]);
      }
      ej[lid] = {};
      for (const c of est) {
        const [piso, estante] = PISO[cat];
        const e = (await q.query(
          `INSERT INTO ejemplares (libro_id, codigo_inventario, ubicacion, estado) VALUES ($1, 'TMP-' || left(replace(gen_random_uuid()::text, '-', ''), 24), $2, $3) RETURNING id`,
          [lid, `${piso} · Estante ${estante}-${10 + i}`, CODE[c]])).rows[0];
        await q.query(`UPDATE ejemplares SET codigo_inventario = 'BQ-' || lpad((2400 + id)::text, 6, '0') WHERE id = $1`, [e.id]);
        (ej[lid][CODE[c]] ||= []).push(e.id);
      }
    }
    const toma = (lid, estado) => ej[lid][estado].shift();

    async function reserva(usuario, ejemplares, { reservada, estado = 'pendiente', entrega = null, devuelto = null }){
      const r = (await q.query(
        `INSERT INTO reservas (usuario_id, bibliotecario_id, estado, fecha_reserva, fecha_expiracion, fecha_retiro)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [uid[usuario], entrega ? uid.bib : null, estado, new Date(reservada), new Date(reservada + 48 * H), entrega && new Date(entrega)])).rows[0];
      const limite = entrega && new Date(entrega + 14 * D);
      for (const e of ejemplares) {
        const det = estado === 'pendiente' ? 'reservado' : estado === 'vencida' ? 'liberado' : devuelto ? 'devuelto' : 'prestado';
        await q.query(
          `INSERT INTO reserva_detalle (reserva_id, ejemplar_id, estado, fecha_limite_devol, fecha_devolucion, condicion_devolucion) VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.id, e, det, limite, devuelto && new Date(devuelto), devuelto ? 'bueno' : null]);
      }
      if (entrega) await q.query(
        `INSERT INTO prestamos (reserva_id, usuario_id, bibliotecario_id, fecha_entrega, fecha_limite, estado) VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.id, uid[usuario], uid.bib, new Date(entrega), limite, devuelto ? 'cerrado' : 'activo']);
      return r.id;
    }

    // Préstamos activos (respaldan cada ejemplar 'prestado')
    await reserva('camila',  [toma(1, 'prestado')],                                              { reservada: ahora - 14 * D, estado: 'retirada', entrega: ahora - 13 * D - 4 * H }); // vence en ~20 h
    await reserva('diego',   [toma(2, 'prestado'), toma(4, 'prestado')],                         { reservada: ahora - 18 * D, estado: 'retirada', entrega: ahora - 17 * D });          // 3 días de retraso
    await reserva('valeria', [toma(4, 'prestado'), toma(7, 'prestado'), toma(8, 'prestado')],    { reservada: ahora - 6 * D,  estado: 'retirada', entrega: ahora - 5 * D });
    await reserva('andres',  [toma(10, 'prestado'), toma(14, 'prestado'), toma(12, 'prestado')], { reservada: ahora - 11 * D, estado: 'retirada', entrega: ahora - 10 * D });
    await reserva('sofia',   [toma(14, 'prestado')],                                             { reservada: ahora - 3 * D,  estado: 'retirada', entrega: ahora - 2 * D });
    // Reservas pendientes de recojo (respaldan cada ejemplar 'reservado')
    await reserva('sofia',   [toma(1, 'reservado'), toma(5, 'reservado')],                       { reservada: ahora - 18 * H });
    await reserva('joaquin', [toma(6, 'reservado'), toma(8, 'reservado'), toma(12, 'reservado')], { reservada: ahora - 8 * H });
    // Historial de Camila: un préstamo devuelto y una reserva vencida
    const r1 = await reserva('camila', [ej[3].disponible[0]], { reservada: ahora - 40 * D, estado: 'retirada', entrega: ahora - 39 * D, devuelto: ahora - 29 * D });
    const r2 = await reserva('camila', [ej[9].disponible[0]], { reservada: ahora - 20 * D, estado: 'vencida' });

    const notif = (u, tipo, asunto, mensaje, reserva_id, cuando) => q.query(
      `INSERT INTO notificaciones (usuario_id, reserva_id, tipo, asunto, mensaje, estado, fecha_programada, fecha_envio, leida_en)
       VALUES ($1,$2,$3,$4,$5,'enviada',$6,$6,$6)`, [uid[u], reserva_id, tipo, asunto, mensaje, new Date(cuando)]);
    await notif('camila', 'devolucion_registrada', 'Devolución registrada', 'Registramos tu devolución de «Clean Code» en buen estado. Tu préstamo quedó cerrado. ¡Gracias!', r1, ahora - 29 * D);
    await notif('camila', 'reserva_vencida', 'Tu reserva venció', 'No se recogió a tiempo «Derecho informático». Los ejemplares volvieron al catálogo. Esto no genera sanción.', r2, ahora - 18 * D);

    await q.query(`INSERT INTO auditoria (accion, entidad, datos_nuevos) VALUES ('SEMBRAR_DATOS', 'sistema', $1)`,
      [JSON.stringify({ libros: LIBROS.length, usuarios: USUARIOS.length })]);
  });
}

const POLITICAS_INICIALES = {
  max_ejemplares: 3, horas_recojo: 48, dias_prestamo: 14, horas_recordatorio: 24,
  dias_sancion_por_dia_retraso: 1, dias_sancion_danio: 7, dias_sancion_perdida: 30
};

/** Modo demo: borra todos los datos (no el esquema) y vuelve a cargar la demostración. */
export async function reiniciarDemo(){
  const tablas = (await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('schema_migraciones', 'configuracion')`)).rows.map(r => r.tablename);
  await db.exec(`TRUNCATE ${tablas.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const [k, v] of Object.entries(POLITICAS_INICIALES)) await db.query('UPDATE configuracion SET valor = $2 WHERE clave = $1', [k, v]);
  await sembrar();
}

export async function sembrarSiVacia(){
  const n = (await db.query('SELECT COUNT(*)::int AS n FROM usuarios')).rows[0].n;
  if (n) return false;
  await sembrar();
  console.log('Base de datos vacía: se cargaron los datos de demostración.');
  return true;
}

const esScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (esScript) {
  await conectar();
  await migrar({ silencioso: true });
  if (!(await sembrarSiVacia())) console.log('La base ya tiene datos. Usa «npm run reset» para empezar de cero.');
  await db.close();
}
