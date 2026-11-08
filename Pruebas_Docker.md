
# Pruebas técnicas de Docker – Entrega 1

## 1. Objetivo

Validar el funcionamiento de la solución desarrollada con Docker Compose, integrada por dos contenedores: una API REST Flask (Python) y una base de datos PostgreSQL.

Las pruebas buscan demostrar que los servicios se ejecutan correctamente, pueden comunicarse entre sí, permiten almacenar y consultar información y conservan los datos después de reiniciar los contenedores.

## 2. Entorno de pruebas

- Proyecto: Integración Continua – Entrega 1, Escenario 3.
- Institución: Politécnico Grancolombiano.
- Repositorio: https://github.com/AndersonMolano/docker-contenedores
- Sistema anfitrión: Windows.
- Herramientas: Docker Desktop, Docker Compose, Git y Visual Studio Code.
- Docker Engine: Linux mediante WSL2.
- API: Flask, Python 3.12.
- Base de datos: PostgreSQL 16.
- Rama de trabajo: `mejora-documentacion-pruebas`.

## 3. Pruebas realizadas

| ID | Prueba | Comando | Resultado |
|---|---|---|---|
| P01 | Validación de configuración | `docker compose config --quiet` | Aprobada |
| P02 | Construcción de imagen Flask | `docker compose build api` | Aprobada |
| P03 | Inicio de servicios | `docker compose up -d` | Aprobada |
| P04 | Estado de contenedores | `docker compose ps` | Aprobada |
| P05 | Comunicación Flask–PostgreSQL | `GET /health` | Aprobada |
| P06 | Escritura de información | `POST /notas` | Aprobada |
| P07 | Lectura de información | `GET /notas` | Aprobada |
| P08 | Persistencia de datos | `docker compose down`, `docker compose up -d` y `GET /notas` | Aprobada |
| P09 | Inspección de red Docker | `docker network inspect docker-contenedores_red_proyecto` | Aprobada |

## 4. Resultados obtenidos

### P01. Validación de Docker Compose

Comando:

`docker compose config --quiet`

Resultado: el comando finalizó sin mostrar errores ni advertencias.

### P02. Construcción de la imagen Flask

Comando:

`docker compose build api`

Resultado: Docker construyó correctamente la imagen `proyecto1-api:1.0`.

### P03 y P04. Inicio y estado de los servicios

Comandos:

`docker compose up -d`

`docker compose ps`

Resultados:

- `proyecto1_api`: Up.
- `proyecto1_db`: Up (healthy).
- Puerto de Flask: 5000.
- Puerto interno de PostgreSQL: 5432.

### P05. Comunicación Flask–PostgreSQL

Comando de PowerShell:

`Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get`

Resultado:

- `api`: ok.
- `base_de_datos`: ok.
- `host_db`: db.

Esto demuestra que la API pudo consultar PostgreSQL mediante el nombre de servicio `db`.

### P06. Escritura en PostgreSQL

Comando de PowerShell:

`Invoke-RestMethod -Uri "http://localhost:5000/notas" -Method Post -ContentType "application/json" -Body '{"texto":"Prueba de integracion continua realizada desde mi rama"}'`

Resultado:

- ID asignado: 1.
- Texto almacenado: Prueba de integracion continua realizada desde mi rama.

### P07. Lectura desde PostgreSQL

Comando:

`Invoke-RestMethod -Uri "http://localhost:5000/notas" -Method Get`

Resultado: la API recuperó la nota previamente almacenada, con identificador 1 y su fecha de creación.

### P08. Persistencia de información

Se ejecutaron los siguientes comandos:

1. `docker compose down`
2. `docker compose up -d`
3. `Invoke-RestMethod -Uri "http://localhost:5000/notas" -Method Get`

Resultado: la nota con identificador 1 permaneció disponible y conservó su fecha de creación.

Esto evidencia el funcionamiento del volumen persistente de PostgreSQL.

**Precaución:** no ejecutar `docker compose down -v` durante esta prueba, porque elimina los volúmenes del proyecto.

### P09. Inspección de la red Docker

Comando:

`docker network inspect docker-contenedores_red_proyecto`

Resultado:

- Red: `docker-contenedores_red_proyecto`.
- Controlador: `bridge`.
- Contenedor Flask: `proyecto1_api`.
- Dirección IP observada: `172.19.0.3`.
- Contenedor PostgreSQL: `proyecto1_db`.
- Dirección IP observada: `172.19.0.2`.

Las direcciones IP son dinámicas. La conexión entre servicios debe utilizar el nombre `db` y no una dirección IP fija.

## 5. Evidencias

Las capturas de las pruebas se conservarán para el informe académico. Deben corresponder a los comandos realmente ejecutados y sus resultados.

## 6. Conclusiones

Las nueve verificaciones realizadas finalizaron satisfactoriamente.

Se confirmó la construcción de la imagen Flask, el funcionamiento simultáneo de ambos contenedores, la comunicación con PostgreSQL, la escritura y recuperación de datos y la persistencia después de recrear los contenedores.

La solución cumple el objetivo técnico de construir dos contenedores Docker comunicados entre sí.

Estas pruebas son locales. La validación de un pipeline en GitHub Actions debe documentarse separadamente mediante una ejecución verificable del workflow.

## 7. Referencias

- Docker. (s. f.). Docker Compose. https://docs.docker.com/compose/
- Docker. (s. f.). Networking in Compose. https://docs.docker.com/compose/how-tos/networking/
- Docker. (s. f.). Volumes. https://docs.docker.com/engine/storage/volumes/
- GitHub. (s. f.). GitHub Actions documentation. https://docs.github.com/actions
