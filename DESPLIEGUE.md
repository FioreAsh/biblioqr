# Publicar BiblioQR con un enlace para compartir

BiblioQR se publica en **Render** (plan gratuito) con su base **PostgreSQL**. El archivo `render.yaml`
ya tiene toda la configuración: solo necesitas subir el proyecto a GitHub y conectarlo.

Tiempo estimado: 10 minutos. No necesitas tarjeta de crédito.

## 1. Subir el proyecto a GitHub (con GitHub Desktop)

1. Abre **GitHub Desktop** → *File → Add local repository…* → elige la carpeta `biblioqr`.
2. Te dirá que no es un repositorio: haz clic en **create a repository** → *Create repository*.
   (El `.gitignore` ya excluye `node_modules`, la base local y el `.env`.)
3. Clic en **Publish repository**. Puedes dejarlo privado; Render puede leer repositorios privados.

## 2. Crear el servicio en Render

1. Entra a <https://render.com> y crea tu cuenta con **Sign in with GitHub**.
2. *New → Blueprint* → elige el repositorio `biblioqr` → **Apply**.
3. Render crea dos cosas: el servicio web `biblioqr` y la base `biblioqr-db`.
   La primera compilación tarda unos 3–5 minutos.
4. Cuando el servicio diga **Live**, tu enlace aparece arriba, algo como
   `https://biblioqr.onrender.com`. Ese es el que compartes.

Al primer arranque se crean las tablas y se cargan los datos de demostración automáticamente.

## Qué ven las personas con el enlace

- Una pantalla de ingreso con tres botones: **Estudiante**, **Bibliotecario** y **Administrador**.
  Entran con un clic, sin correo real.
- También pueden registrarse con cualquier correo `@aula.edu.pe` (el código aparece en pantalla).
- Todos comparten los mismos datos. Como administrador, en **Panel → Datos de demostración**
  puedes **reiniciar** todo a los datos iniciales cuando quieras (por ejemplo, antes de una presentación).

## Limitaciones del plan gratuito de Render

- **El servicio se duerme** tras 15 minutos sin visitas. La siguiente visita tarda ~50 segundos en
  despertar; después va normal. Abre el enlace un minuto antes de presentar.
- **La base PostgreSQL gratuita vence a los 30 días.** Render avisa por correo. Opciones:
  - pasar la base a un plan pagado en Render, o
  - crear una base gratuita en [Neon](https://neon.tech) y pegar su cadena de conexión en
    *Render → biblioqr → Environment → DATABASE_URL*, o
  - borrar la variable `DATABASE_URL`: el sistema usa su PostgreSQL embebido, que se reinicia
    a los datos de demostración cada vez que el servicio se duerme o se vuelve a desplegar.

## Actualizar la página publicada

Cada cambio que subas con GitHub Desktop (*Commit* → *Push origin*) se publica solo en Render en un par de minutos.

## Pasar de demostración a uso real

En *Render → biblioqr → Environment*:

| Variable | Valor |
|---|---|
| `MODO_DEMO` | `0` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Datos de tu correo saliente |

Y agrega `nodemailer` al backend (`npm install nodemailer` dentro de `backend/`, luego commit y push).
Sin modo demo, los códigos ya no aparecen en pantalla: llegan al correo de cada persona.
Recuerda cambiar los usuarios de demostración por los reales desde **Usuarios**.
