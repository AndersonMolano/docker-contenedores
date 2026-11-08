# Proyecto 1: Docker con dos contenedores comunicados

API en **Flask (Python)** con un **dashboard interactivo de ventas** que guarda y lee
datos en una base de datos **PostgreSQL**.
Ambos servicios corren en contenedores distintos, orquestados con Docker Compose.

- Dashboard: **http://localhost:5000** (o el puerto que pongas en `API_PORT`)
- Lista de endpoints de la API: http://localhost:5000/api

## Arquitectura

```
Cliente (curl / navegador)
        |  http://localhost:5000
        v
+------------------+     red_proyecto      +-------------------+
|  api (Flask)     | --------------------> |  db (PostgreSQL)  |
|  puerto 5000     |   host = "db"         |  puerto 5432      |
+------------------+  (nombre del servicio)+---------+---------+
                                                     |
                                              volumen datos_postgres
```

La API se conecta a la base de datos usando el **nombre del servicio** (`db`),
no `localhost` ni una IP fija.

## Estructura

```
.
├── api/                  # Servicio 1: API Flask
│   ├── Dockerfile
│   ├── app.py            # API + rutas del dashboard; crea las tablas al arrancar
│   ├── templates/
│   │   └── index.html    # Dashboard (Chart.js)
│   ├── requirements.txt
│   └── .dockerignore
├── .github/workflows/    # CI con GitHub Actions
│   └── docker-build.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

## Requisitos

- Docker Desktop (con Docker Compose v2+)
- Git

## Cómo levantar los contenedores

1. Clonar el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd docker-dos-contenedores
   ```
2. Crear el archivo de variables de entorno (no se sube al repo):
   ```bash
   # Windows (PowerShell / CMD)
   copy .env.example .env
   # Linux / Mac
   cp .env.example .env
   ```
   Edita `.env` y cambia `POSTGRES_PASSWORD`.
3. Construir y levantar todo:
   ```bash
   docker compose up --build
   ```
   (o en segundo plano: `docker compose up -d --build`)

## Dashboard interactivo

Al arrancar, la API crea en PostgreSQL las tablas `notas`, `productos` y `ventas`.
Si la base de datos está vacía, carga 2.500 ventas de ejemplo (enero a octubre de 2026).
Todos los cálculos (sumas, promedios, agrupaciones) se hacen con SQL dentro del contenedor `db`.

| Acción | Qué pasa |
|---|---|
| Clic en un **mes** del gráfico de tiempo | Muestra ese mes día por día y filtra todo el dashboard |
| Clic en un **día** o **semana** | Filtra la tabla de detalle a esas fechas |
| Clic en una **categoría** o **ciudad** | Filtra todo; un segundo clic quita el filtro |
| Clic en un producto del **Top 5** | Lo busca en la tabla de detalle |
| Barra de filtros | Ciudad, categoría y rango de fechas, combinables |
| **Ingresos / Unidades** | Cambia la métrica de todos los gráficos |
| Tabla de detalle | Búsqueda, orden por columna y paginación |
| **+ Nueva venta** / 🗑 | Inserta o borra ventas en la base de datos |
| **Exportar CSV** | Descarga las ventas filtradas (se abre en Excel) |
| **Actualización en vivo** | Vuelve a consultar la BD cada 10 segundos |

Demostración para la sustentación: abre el dashboard en dos pestañas, activa
**Actualización en vivo** en una y registra una venta en la otra. Los números cambian
solos porque ambas leen el mismo contenedor `db`.

Endpoints del dashboard:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/opciones` | Ciudades, categorías, productos y rango de fechas |
| GET | `/api/dashboard` | KPIs y datos de los gráficos (`ciudad`, `categoria`, `mes`, `desde`, `hasta`, `metrica`, `granularidad`) |
| GET | `/api/ventas` | Detalle paginado (`q`, `orden`, `dir`, `pagina`, `tamano` + filtros) |
| POST | `/api/ventas` | `{"producto_id":1,"ciudad":"Cali","cantidad":2,"fecha":"2026-10-15"}` |
| DELETE | `/api/ventas/<id>` | Elimina una venta |
| GET | `/api/exportar.csv` | CSV con los filtros activos |

> El navegador necesita internet para cargar la librería de gráficos (Chart.js).

## Probar la comunicación entre contenedores

Con los contenedores arriba, en otra terminal:

```bash
# 1. Salud: la API consulta la BD
curl http://localhost:5000/health

# 2. Ida: la API ESCRIBE un dato en la BD
curl -X POST http://localhost:5000/notas -H "Content-Type: application/json" -d "{\"texto\":\"hola desde docker\"}"

# 3. Vuelta: la API LEE el dato desde la BD
curl http://localhost:5000/notas
```

> En PowerShell usa `curl.exe` en lugar de `curl`, o `Invoke-RestMethod`.

## Comandos útiles para las evidencias

```bash
docker compose build
docker compose up -d
docker ps
docker network ls
docker network inspect docker-contenedores_red_proyecto
docker compose logs api
docker compose down        # detener (conserva el volumen)
docker compose down -v     # detener y borrar datos
```

## Buenas prácticas aplicadas

- Imágenes base oficiales con versión fija (`python:3.12-slim`, `postgres:16-alpine`).
- Credenciales en `.env` (ignorado por Git); se incluye `.env.example`.
- `.dockerignore` para no copiar archivos innecesarios a la imagen.
- Volumen `datos_postgres` para persistir los datos.
- `healthcheck` + `depends_on` para que la API espere a que la BD esté lista.
- Red propia (`red_proyecto`) y comunicación por nombre de servicio.
- CI: GitHub Actions construye las imágenes en cada push y pull request.

