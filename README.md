# Proyecto 1: Docker con dos contenedores comunicados

API en **Flask (Python)** que guarda y lee datos en una base de datos **PostgreSQL**.
Ambos servicios corren en contenedores distintos, orquestados con Docker Compose.

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
│   ├── app.py
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

