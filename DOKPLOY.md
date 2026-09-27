# Subir DEAD PLANNER a Dokploy

## 1. Preparar el código

Esta carpeta ya es la raíz del proyecto lista para GitHub. Súbela mediante Git o GitHub Desktop a un repositorio privado. `Dockerfile` y `docker-compose.yml` están en la raíz; no necesitas extraer ni subir el ZIP de `dist/`.

Si usas Git desde esta carpeta, revisa `git status --short`, agrega los archivos con `git add .`, crea tu primer commit y conecta el repositorio remoto que hayas creado en GitHub. No hay un remoto configurado ni se publican archivos automáticamente.

`.gitignore` excluye `data/`, `node_modules/`, `.env` reales, `dist/` y `.local-archive/`. Esta última carpeta conserva los informes y respaldos antiguos, fuera del código publicado. No uses `git add -f` para incluirlos. Si subes archivos desde la web de GitHub, esas exclusiones no se aplican automáticamente: usa Git o GitHub Desktop. Tus datos locales no se envían ni se modifican automáticamente.

## 2. Crear el servicio en Dokploy

1. En tu proyecto, crea un servicio de tipo **Docker Compose** (no Docker Stack).
2. Conecta el repositorio y selecciona la rama que hayas subido.
3. Define **Compose Path** como `./docker-compose.yml`.
4. En **Environment**, añade `SEED_USERNAME` con el nombre elegido para tu administrador (3–60 letras, números, puntos, guiones o guiones bajos) y `SEED_PASSWORD` con una contraseña nueva y única (12 caracteres como mínimo; 72 bytes como máximo). Puedes generar un valor hexadecimal largo con un gestor de contraseñas. `.env.example` muestra el nombre de la variable.
5. Guarda la configuración.

El usuario inicial se elige con `SEED_USERNAME` y se crea con rol admin. El Compose fija el entorno en producción y la zona horaria en `America/Santiago`. Ambas variables de seed se usan únicamente si la base está vacía. Con una base existente no cambia ninguna contraseña: utiliza ADMIN para cambiarla.

## 3. Dominio y HTTPS

Crea un registro DNS A de tu dominio o subdominio hacia la IP del VPS. Si tienes un registro AAAA, también debe apuntar al VPS correcto.

En **Domains > Add Domain** del servicio configura:

| Campo | Valor |
| --- | --- |
| Host | Tu dominio o subdominio, sin `https://` |
| Service Name | `dead-planner` |
| Container Port | `3000` |
| Path | `/` |
| HTTPS | Activado, con certificado Let's Encrypt |

Utiliza el modo de redes aisladas de Dokploy si está disponible. Dokploy añade las etiquetas y redes de su proxy al desplegar; no necesitas escribir reglas de Traefik. Puedes revisar **Preview Compose** antes de desplegar.

La aplicación usa cookies `Secure`: debes entrar por HTTPS. El puerto 3000 es interno y no se publica directamente en el VPS. Los puertos públicos 80/443 deben llegar al proxy de Dokploy.

## 4. Primer despliegue

Pulsa **Deploy**. Dokploy construirá la imagen y ejecutará la instalación de dependencias dentro de Docker. El proceso de la app corre como el usuario `node` (UID 1000), no como root.

Comprueba que el servicio quede `healthy`. El chequeo interno consulta `/api/health`, que devuelve `{"status":"ok"}` si el proceso está activo y la base está cargada; no comprueba escritura en disco. Luego entra por tu dominio HTTPS y accede con el usuario de `SEED_USERNAME` y la contraseña configurada. Si importaste una base existente, usa su contraseña anterior.

Comprueba manualmente: login, registro completo, creación de una tarea, recarga de página y panel ADMIN. El ZIP no ha sido desplegado ni la imagen construida en esta sesión.

## 5. Persistencia y actualizaciones

El volumen lógico `dead-planner-data` se monta en `/app/data`. Docker Compose le asigna un nombre que incluye el proyecto. Conserva el mismo servicio/proyecto y volumen al actualizar. No uses `down -v`, no borres el volumen y no habilites réplicas múltiples: esta aplicación utiliza un archivo JSON y debe funcionar con una sola instancia.

El cambio de Node 20 a Node 24 no migra ni borra los datos. Los roles existentes se conservan; cambiar `SEED_USERNAME` no promueve otra cuenta ni reemplaza al administrador. Solo se mantiene la migración histórica de `xergno` para bases antiguas que todavía no tenían roles.

### Copia de seguridad

Antes de actualizar, detén el servicio desde Dokploy y descarga `/app/data/db.json` desde el contenedor o respalda el volumen. Si utilizas la terminal del VPS con el mismo proyecto Compose y sus variables, puedes copiar el archivo con:

```sh
docker compose cp dead-planner:/app/data/db.json ./db-backup.json
```

Reinicia el servicio después de copiar. Guarda el respaldo fuera del repositorio y, preferentemente, fuera del VPS: contiene datos personales y sesiones. La copia debe realizarse sin escrituras concurrentes.

### Importar tus datos locales o restaurar

1. Haz una copia del archivo local `data/db.json` y del archivo del VPS si ya existe.
2. Detén el servicio del VPS. Copia el archivo que quieres restaurar a `/app/data/db.json` dentro del volumen. No copies `node_modules` ni toda la carpeta del proyecto.
3. Asegura que `/app/data` y `db.json` sean escribibles por UID/GID `1000:1000`. Si se reutiliza un volumen de la versión antigua, posiblemente pertenezca a root.
4. Si tienes acceso a la terminal del proyecto Compose, con el servicio detenido puedes corregir esos permisos así:

```sh
docker compose run --rm --no-deps --user root --entrypoint sh dead-planner -c 'chown -R node:node /app/data'
```

5. Reinicia y verifica que aparezcan las cuentas y tareas. Importar reemplaza la base de destino; no combina dos bases.

Si aparece `EACCES`, revisa esos permisos. Si la base no es JSON válido, el arranque falla conservando el archivo: restaura un respaldo válido; no elimines la base como solución.

## Archivos y configuración incluidos

- Dockerfile con Node 24, `npm ci`, tzdata, usuario sin privilegios y healthcheck.
- Compose con volumen persistente, arranque automático, logs limitados y puerto interno.
- Cookies HTTPS y validación de contraseña inicial en producción.
- Exclusiones de build: no se incorporan secretos, datos, pruebas ni scripts de reparación.
- `.gitignore` protege `.env`, datos, dependencias y archivos ZIP.

## Referencias oficiales

- [Dominios Docker Compose en Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains)
- [Variables y configuración de Docker Compose en Dokploy](https://docs.dokploy.com/docs/core/docker-compose)
- [Soporte de Node 24 LTS](https://nodejs.org/en/blog/migrations/v22-to-v24)
