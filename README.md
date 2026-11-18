# MI VIAJE — versión inicial para Cloudflare Pages + D1

Esta entrega es una base funcional inicial: registro e inicio de sesión, sesiones mediante cookie HttpOnly, creación/listado de viajes y colaboración por correo entre usuarios registrados. No es todavía la aplicación completa de planificación turística.

## Requisitos
- Cuenta gratuita de Cloudflare.
- Repositorio GitHub conectado a Cloudflare Pages.
- Una base de datos Cloudflare D1.

## 1. Crear la base de datos D1
1. En Cloudflare, abre **Workers & Pages → D1 SQL Database** (o **Storage & databases → D1**).
2. Crea una base de datos llamada `mi-viaje-db`.
3. Copia el **Database ID** que muestra Cloudflare.
4. En GitHub, edita `wrangler.toml` y sustituye `REEMPLAZA_CON_TU_DATABASE_ID` por ese ID real. No cambies el nombre del binding `DB`.
5. Guarda el cambio en la rama principal.

## 2. Crear las tablas
En la base de datos D1, abre **Console** y ejecuta el contenido completo de `migrations/0001_init.sql`.

## 3. Conectar GitHub a Cloudflare Pages
1. En Cloudflare abre **Workers & Pages → Create application → Pages → Connect to Git**.
2. Autoriza GitHub y selecciona este repositorio.
3. Nombre del proyecto: `mi-viaje`.
4. Framework preset: **None**.
5. Build command: déjalo vacío.
6. Build output directory: `public`.
7. Completa el despliegue.

## 4. Asociar D1 al proyecto Pages
En Cloudflare abre el proyecto Pages `mi-viaje` → **Settings → Functions → D1 database bindings**.
Añade un binding con:
- Variable name: `DB`
- D1 database: `mi-viaje-db`
Guarda y vuelve a desplegar el proyecto para que la función reciba el binding.

## 5. Comprobar
- Abre la dirección `https://mi-viaje.pages.dev/` (usa la URL exacta que Cloudflare asigne).
- Para probar la API abre `/api/health`; debe devolver `{"ok":true,"service":"MI VIAJE API"}`.
- Registra una cuenta con una contraseña de al menos 12 caracteres.
- Crea un viaje.
- Para compartirlo, la otra persona debe registrarse primero; después añade su correo desde el botón **Compartir**.

## Limitaciones importantes de esta versión
- No hay verificación de correo ni recuperación de contraseña. El correo sólo identifica la cuenta; no se envía ningún mensaje.
- No hay limitación de intentos de inicio de sesión integrada. Antes de abrir el registro al público, añade reglas de protección/rate limiting en Cloudflare y prueba seguridad.
- No se deben guardar pasaportes, tarjetas, contraseñas de otros servicios ni documentos sensibles en esta versión.
- No incluye todavía itinerarios diarios, mapas, presupuestos, archivos adjuntos, traducción ni conversión de divisas.
- El plan gratuito tiene límites y condiciones que pueden cambiar; no existe garantía de uso ilimitado o coste cero para siempre.

## Estructura
```text
mi-viaje-corregido/
├── functions/
│   └── api/
│       └── [[path]].js
├── migrations/
│   └── 0001_init.sql
├── public/
│   ├── icon.svg
│   ├── index.html
│   └── manifest.webmanifest
├── wrangler.toml
└── README.md
```
