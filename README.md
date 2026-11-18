# MI VIAJE — primera versión funcional

Aplicación web/PWA en español con:
- Registro e inicio de sesión por correo y contraseña.
- Contraseñas derivadas con PBKDF2-SHA-256 (310.000 iteraciones) y sal aleatoria.
- Sesiones opacas en cookie HttpOnly, Secure y SameSite=Lax; sólo se guarda el hash del token.
- Creación, edición y eliminación de viajes.
- Compartir un viaje con otros usuarios registrados por correo.
- Base de datos Cloudflare D1. No requiere PC encendido, NAS, Firebase, Supabase ni servicio de pago.

## Coste

El código no tiene licencias de pago ni integra servicios premium obligatorios. Cloudflare tiene un plan gratuito con límites; no se garantiza gratuidad ilimitada. Si se superan los límites, tendrás que reducir uso o elegir otra infraestructura. El dominio propio es opcional; se puede usar el subdominio gratuito de Cloudflare.

## Despliegue

Requisitos: cuenta gratuita de Cloudflare y Node.js instalado en tu equipo sólo para ejecutar el proceso de publicación. Tu ordenador NO será el servidor: la aplicación quedará alojada en Cloudflare.

1. Instala Wrangler:
   `npm install -g wrangler`
2. Inicia sesión:
   `wrangler login`
3. Crea la base de datos:
   `npx wrangler d1 create mi-viaje-db`
4. Copia el `database_id` que te devuelve el comando y sustituye `REEMPLAZA_CON_TU_DATABASE_ID` en `wrangler.toml`.
5. Aplica el esquema:
   `npx wrangler d1 migrations apply mi-viaje-db --remote`
6. Publica la aplicación:
   `npx wrangler pages deploy public --project-name mi-viaje`

Si Wrangler pide crear el proyecto de Pages, acepta. Al terminar te dará una URL `*.pages.dev`.

## Cómo compartir un viaje

1. Cada viajero crea su propia cuenta desde la web.
2. El propietario abre el viaje.
3. En “Compartir este viaje”, escribe el correo con el que la otra persona se registró.
4. Esa persona verá el viaje al iniciar sesión y podrá editarlo.

En esta primera versión sólo el propietario puede añadir participantes o borrar el viaje. Los participantes pueden consultar y editar. La invitación no envía correo: el propietario comunica a los viajeros que ya tienen acceso.

## Límites y seguridad que debes conocer

- Es una primera versión funcional, no una plataforma auditada profesionalmente.
- No incluye recuperación de contraseña por email, verificación de correo, MFA, rate limiting ni invitaciones por enlace. No uses una contraseña reutilizada.
- No almacenes pasaportes, tarjetas, billetes con datos personales ni documentos sensibles todavía.
- Las notas de viaje son visibles para todos los miembros del viaje.
- Los límites del plan gratuito de Cloudflare pueden cambiar. Revisa el panel de uso.
- Para una aplicación pública real conviene añadir rate limiting, verificación de email, recuperación segura, protección antiabuso, auditoría de seguridad y pruebas.

## Estructura

- `public/`: interfaz web instalable.
- `functions/api/[[path]].js`: API y autenticación.
- `migrations/0001_init.sql`: tablas de usuarios, sesiones, viajes y miembros.
- `wrangler.toml`: configuración de Cloudflare Pages + D1.
