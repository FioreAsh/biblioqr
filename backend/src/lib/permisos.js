/**
 * Matriz de permisos por rol. El backend valida cada ruta con estos permisos;
 * el frontend solo los usa para mostrar u ocultar módulos.
 */
export const PERMISOS = {
  'catalogo.ver':            'Consultar el catálogo y la disponibilidad',
  'reservas.crear':          'Crear reservas desde el carrito',
  'cuenta.propia':           'Ver sus reservas, préstamos, sanciones y notificaciones',
  'mostrador.operar':        'Escanear QR, entregar libros y registrar devoluciones',
  'incidencias.registrar':   'Registrar retrasos, daños y pérdidas',
  'ejemplares.gestionar':    'Cambiar el estado físico de ejemplares (mantenimiento, perdido)',
  'sanciones.gestionar':     'Ver, aplicar y levantar suspensiones',
  'libros.gestionar':        'Crear, editar y eliminar libros, ejemplares, categorías y etiquetas',
  'usuarios.gestionar':      'Crear usuarios, cambiar roles y activar o desactivar cuentas',
  'auditoria.ver':           'Consultar la bitácora de auditoría',
  'configuracion.gestionar': 'Modificar plazos y políticas de la biblioteca',
  'reportes.ver':            'Ver indicadores generales'
};

export const ROLES = {
  estudiante: {
    nombre: 'Estudiante',
    permisos: ['catalogo.ver', 'reservas.crear', 'cuenta.propia']
  },
  bibliotecario: {
    nombre: 'Bibliotecario',
    permisos: ['catalogo.ver', 'mostrador.operar', 'incidencias.registrar', 'ejemplares.gestionar', 'sanciones.gestionar', 'reportes.ver']
  },
  administrador: {
    nombre: 'Administrador',
    permisos: Object.keys(PERMISOS).filter(p => !['reservas.crear', 'cuenta.propia'].includes(p))
  }
};

export const permisosDe = rol => ROLES[rol]?.permisos ?? [];
