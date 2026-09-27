<div align="center">

# DEAD_PLANNER<span>_</span>

**Tu tiempo. Tus reglas. Hasta que termine la noche.**

`planning subsystem / time allocation daemon`

![Node.js](https://img.shields.io/badge/NODE.JS-24_LTS-111111?style=flat-square&logo=nodedotjs&logoColor=ffffff)
![JavaScript](https://img.shields.io/badge/JAVASCRIPT-VANILLA-111111?style=flat-square&logo=javascript&logoColor=ffffff)
![Docker](https://img.shields.io/badge/DOCKER-READY-111111?style=flat-square&logo=docker&logoColor=ffffff)
![Dokploy](https://img.shields.io/badge/DEPLOY-DOKPLOY-111111?style=flat-square)

[El sistema](#el-sistema) · [Funciones](#funciones) · [Despliegue](#despliegue) · [Desarrollo](#desarrollo)

</div>

```text
deadplanner@hack ~$ boot --planner

[ OK ] interface ........... monochrome / terminal
[ OK ] time window ......... 05:00 -> 04:59 (+1 day)
[ OK ] views ............... day / week / month / year
[ OK ] storage ............. persistent JSON
[ >> ] awaiting your next task_
```

---

## El sistema

**DEAD PLANNER** es un calendario personal para organizar el día sin cortar la noche a medianoche. Cada jornada empieza a las **05:00** y termina a las **04:59 del día siguiente**.

Su identidad visual toma como referencia la estética de **deadsmile**: fondo negro, blanco y grises, tipografía **IBM Plex Mono**, bordes de terminal y detalles de parpadeo CRT. El color se reserva para distinguir tareas y etiquetas.

Una interfaz directa. Un calendario que sigue tu horario.

## Funciones

| Subsistema | Qué puedes hacer |
| :--- | :--- |
| **Calendario** | Cambiar entre día, semana, mes y año; navegar entre fechas y volver a hoy. |
| **Tareas** | Crear, editar y borrar tareas con título, descripción, inicio, fin y color. |
| **Interacción** | Mover tareas y cambiar su duración mediante arrastre, con ajustes de 30 minutos. |
| **Bloques de 30 min** | Ver únicamente el título, con texto más grande y legible. |
| **Tags** | Crear etiquetas con nombre y color, y asignar una etiqueta a cada tarea. |
| **Perfil** | Editar nombre, email, username y avatar. |
| **Registro** | Crear una cuenta con todos los campos obligatorios y confirmación de contraseña. |
| **Administración** | Listar usuarios, editar datos, cambiar contraseñas, bloquear y eliminar cuentas. |

La cuenta **`xergno`** es administradora. Los nuevos registros reciben el rol de usuario normal. Los permisos se verifican en el servidor; la cuenta administradora está protegida contra bloqueo y eliminación.

> El catálogo de tags se guarda en el navegador, separado por usuario. La etiqueta asignada y su color se guardan junto con la tarea en el servidor.

## Despliegue

```text
GitHub  ->  Dokploy  ->  Docker Compose  ->  DEAD_PLANNER
                                               |
                                          /app/data
```

La raíz de este repositorio ya contiene el **Dockerfile** y **docker-compose.yml**. No necesitas generar un build de frontend ni subir `node_modules`.

1. En Dokploy, crea un servicio **Docker Compose** y conecta [`vx66/dead-planner`](https://github.com/vx66/dead-planner).
2. Selecciona la rama `main` y el archivo `./docker-compose.yml`.
3. En **Environment**, configura `SEED_PASSWORD` con una contraseña única de al menos 12 caracteres y un máximo de 72 bytes.
4. Asocia tu dominio al servicio **`dead-planner`**, puerto interno **`3000`**, y activa **HTTPS**.
5. Despliega e inicia sesión como **`xergno`**.

### Configuración incluida

| Opción | Valor |
| :--- | :--- |
| Runtime | Node.js 24 sobre Alpine |
| Dependencias | Instalación con `npm ci` y `package-lock.json` |
| Usuario del contenedor | `node`, sin privilegios de root |
| Zona horaria | `America/Santiago` |
| Puerto de la aplicación | `3000`, interno |
| Persistencia | Volumen `dead-planner-data` en `/app/data` |
| Healthcheck | `GET /api/health` |
| Sesiones en producción | Cookies `HttpOnly`, `SameSite=Lax` y `Secure` |

**[Leer la guía completa de Dokploy →](DOKPLOY.md)**

> `SEED_PASSWORD` solo crea la cuenta inicial cuando la base está vacía. Si importas una base existente, se conservan sus cuentas y contraseñas. Cambia las contraseñas desde ADMIN; no borres la base para reiniciarlas.

## Desarrollo

Recomendado: **Node.js 24**. Para arrancar manualmente desde PowerShell:

```powershell
git clone https://github.com/vx66/dead-planner.git
cd dead-planner
npm ci
$env:SEED_PASSWORD = "TU_CONTRASENA_LOCAL_UNICA"
npm start
```

Abre `http://localhost:3000`. La variable anterior es necesaria para usar una contraseña propia al crear una base local nueva. El archivo `.env.example` documenta las variables de despliegue; la ejecución directa con Node no carga archivos `.env` automáticamente.

### Pruebas aisladas

Con las dependencias instaladas:

```powershell
node --test audit/regression.test.cjs audit/accounts.test.cjs
```

Las pruebas cubren calendario, tareas, registro, administración, permisos y configuración de producción con almacenamiento simulado. No abren puertos ni modifican la base real.

## Estructura

```text
dead-planner/
|-- public/
|   |-- index.html          # Interfaz
|   |-- css/style.css       # Estética terminal
|   `-- js/
|       |-- app.js          # Sesión, perfil y editor de tareas
|       |-- calendar.js     # Vistas e interacciones
|       |-- accounts.js     # Registro y dashboard admin
|       |-- api.js          # Cliente HTTP
|       `-- date.js         # Utilidades de fecha
|-- server.js               # API, autenticación y archivos estáticos
|-- accounts.js             # Registro y administración en servidor
|-- store.js                # Persistencia JSON
|-- audit/                  # Pruebas de regresión
|-- Dockerfile
|-- docker-compose.yml
|-- .env.example
`-- DOKPLOY.md              # Despliegue, respaldos y restauración
```

## Datos y respaldos

Usuarios, sesiones y tareas viven en **`data/db.json`**. El contenedor conserva este archivo en un volumen persistente; funciona con **una sola instancia** de la aplicación.

Antes de migrar o actualizar, realiza una copia de seguridad. Mantén el mismo volumen entre despliegues. Si un archivo de base de datos no puede leerse, el arranque se detiene sin reemplazarlo por una base vacía.

`.gitignore` excluye datos, dependencias, archivos `.env` reales, paquetes de `dist/` y el archivo histórico `.local-archive/`. No incluyas esos directorios mediante `git add -f`.

---

<div align="center">

**DEAD_PLANNER** · by [vx66](https://github.com/vx66)

`deadplanner@hack ~$ make time count_`

</div>
