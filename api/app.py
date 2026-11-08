"""
Contenedor 1: API Flask + dashboard interactivo de ventas.

Lee y escribe todos los datos en el contenedor 2 (PostgreSQL). DB_HOST es el
NOMBRE DEL SERVICIO en docker-compose.yml ("db"): Docker lo resuelve por DNS
dentro de la red. No se usa localhost ni una IP fija.
"""
import csv
import io
import os
import socket
import time
from datetime import date, datetime
from decimal import Decimal

import psycopg2
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Listas blancas: nunca se mete texto del usuario directamente en el SQL
METRICAS = {"ingresos": "SUM(ingreso)", "unidades": "SUM(cantidad)"}
GRANULARIDADES = {"mes": "month", "semana": "week", "dia": "day"}
COLUMNAS_ORDEN = {
    "id": "id", "fecha": "fecha", "producto": "producto", "categoria": "categoria",
    "ciudad": "ciudad", "cantidad": "cantidad", "ingreso": "ingreso",
}


# =================================================================== conexión
def get_connection():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def consultar(sql, params=()):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            filas = cur.fetchall()
    finally:
        conn.close()
    return [[_json(c) for c in fila] for fila in filas]


def _json(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor


# =================================================================== esquema
ESQUEMA = """
CREATE TABLE IF NOT EXISTS notas (
    id     SERIAL PRIMARY KEY,
    texto  TEXT NOT NULL,
    creada TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(100)   NOT NULL,
    categoria VARCHAR(50)    NOT NULL,
    precio    NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas (
    id          SERIAL PRIMARY KEY,
    fecha       DATE        NOT NULL,
    producto_id INT         NOT NULL REFERENCES productos(id),
    ciudad      VARCHAR(50) NOT NULL,
    cantidad    INT         NOT NULL CHECK (cantidad > 0)
);

CREATE OR REPLACE VIEW ventas_detalle AS
SELECT v.id, v.fecha, v.ciudad, v.cantidad,
       p.nombre AS producto, p.categoria, p.precio,
       v.cantidad * p.precio AS ingreso
FROM ventas v
JOIN productos p ON p.id = v.producto_id;
"""

# Datos de ejemplo: solo se cargan si la tabla de productos está vacía
DATOS_EJEMPLO = """
INSERT INTO productos (nombre, categoria, precio) VALUES
    ('Portátil 14"',           'Tecnología', 2800000),
    ('Celular gama media',     'Tecnología', 1200000),
    ('Audífonos inalámbricos', 'Tecnología',  180000),
    ('Monitor 24"',            'Tecnología',  650000),
    ('Silla ergonómica',       'Hogar',       520000),
    ('Lámpara de escritorio',  'Hogar',        85000),
    ('Cafetera',               'Hogar',       210000),
    ('Camiseta deportiva',     'Ropa',         65000),
    ('Tenis para correr',      'Ropa',        320000),
    ('Chaqueta impermeable',   'Ropa',        240000),
    ('Libro de programación',  'Libros',       95000),
    ('Agenda 2026',            'Libros',       35000);

-- 2.500 ventas simuladas entre enero y octubre de 2026 (siempre las mismas)
SELECT setseed(0.42);
INSERT INTO ventas (fecha, producto_id, ciudad, cantidad)
SELECT
    DATE '2026-01-01' + floor(random() * 304)::int,
    (SELECT MIN(id) FROM productos) + floor(random() * 12)::int,
    (ARRAY['Bogotá','Bogotá','Bogotá','Medellín','Medellín',
           'Cali','Cali','Barranquilla','Bucaramanga','Cartagena'])[1 + floor(random() * 10)::int],
    1 + floor(random() * 4)::int
FROM generate_series(1, 2500);
"""


def init_db(reintentos=15):
    """Crea las tablas (y los datos de ejemplo la primera vez).
    Reintenta mientras PostgreSQL termina de arrancar."""
    for i in range(reintentos):
        try:
            conn = get_connection()
            break
        except psycopg2.OperationalError:
            print(f"Esperando la base de datos... {i + 1}/{reintentos}", flush=True)
            time.sleep(2)
    else:
        raise RuntimeError("No se pudo conectar a la base de datos")

    try:
        with conn, conn.cursor() as cur:
            # Candado para que dos procesos no inicialicen al mismo tiempo
            cur.execute("SELECT pg_advisory_xact_lock(424242)")
            cur.execute(ESQUEMA)
            cur.execute("SELECT COUNT(*) FROM productos")
            if cur.fetchone()[0] == 0:
                cur.execute(DATOS_EJEMPLO)
                print("Datos de ejemplo del dashboard cargados", flush=True)
    finally:
        conn.close()


# =================================================================== páginas
@app.get("/")
def index():
    """Dashboard interactivo."""
    return render_template("index.html")


@app.get("/api")
def info():
    return jsonify(
        mensaje="API Flask funcionando",
        endpoints=[
            "GET /health", "POST /notas", "GET /notas",
            "GET /api/opciones", "GET /api/dashboard",
            "GET /api/ventas", "POST /api/ventas", "DELETE /api/ventas/<id>",
            "GET /api/exportar.csv",
        ],
    )


# =================================================================== salud
@app.get("/health")
def health():
    """Prueba de comunicación entre los 2 contenedores."""
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT version(), (SELECT COUNT(*) FROM ventas)")
            version, total = cur.fetchone()
        conn.close()
    except Exception as e:
        return jsonify(api="ok", base_de_datos="error", detalle=str(e)), 500
    return jsonify(
        api="ok",
        base_de_datos="ok",
        host_db=os.environ["DB_HOST"],
        ip_db=socket.gethostbyname(os.environ["DB_HOST"]),
        contenedor_api=socket.gethostname(),
        version_db=version,
        ventas_en_bd=total,
    )


# =================================================================== notas
@app.post("/notas")
def crear_nota():
    datos = request.get_json(silent=True) or {}
    texto = datos.get("texto")
    if not texto:
        return jsonify(error="Falta el campo 'texto'"), 400
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("INSERT INTO notas (texto) VALUES (%s) RETURNING id", (texto,))
            nuevo_id = cur.fetchone()[0]
    finally:
        conn.close()
    return jsonify(id=nuevo_id, texto=texto), 201


@app.get("/notas")
def listar_notas():
    filas = consultar("SELECT id, texto, creada FROM notas ORDER BY id")
    return jsonify([{"id": f[0], "texto": f[1], "creada": f[2]} for f in filas])


# =================================================================== dashboard
def filtros(excluir=()):
    """Arma el WHERE a partir de los parámetros de la URL.
    `excluir` permite que un gráfico ignore su propio filtro (filtro cruzado)."""
    a = request.args
    conds, params = [], []
    if a.get("ciudad") and "ciudad" not in excluir:
        conds.append("ciudad = %s"); params.append(a["ciudad"])
    if a.get("categoria") and "categoria" not in excluir:
        conds.append("categoria = %s"); params.append(a["categoria"])
    if a.get("mes") and "mes" not in excluir:
        conds.append("to_char(fecha, 'YYYY-MM') = %s"); params.append(a["mes"])
    if a.get("desde"):
        conds.append("fecha >= %s"); params.append(a["desde"])
    if a.get("hasta"):
        conds.append("fecha <= %s"); params.append(a["hasta"])
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    return where, params


@app.get("/api/opciones")
def opciones():
    """Valores para llenar los selectores del dashboard."""
    rango = consultar("SELECT MIN(fecha), MAX(fecha) FROM ventas")[0]
    return jsonify(
        ciudades=[c[0] for c in consultar("SELECT DISTINCT ciudad FROM ventas ORDER BY 1")],
        categorias=[c[0] for c in consultar("SELECT DISTINCT categoria FROM productos ORDER BY 1")],
        productos=[{"id": p[0], "nombre": p[1], "precio": p[2]}
                   for p in consultar("SELECT id, nombre, precio FROM productos ORDER BY nombre")],
        fecha_min=rango[0], fecha_max=rango[1],
    )


@app.get("/api/dashboard")
def dashboard():
    """KPIs y datos de todos los gráficos según los filtros activos."""
    metrica = METRICAS.get(request.args.get("metrica"), METRICAS["ingresos"])
    gran = GRANULARIDADES.get(request.args.get("granularidad"), "month")

    w, p = filtros()
    kpi = consultar(
        f"""SELECT COALESCE(SUM(ingreso),0), COALESCE(SUM(cantidad),0), COUNT(*),
                   COALESCE(AVG(ingreso),0)
            FROM ventas_detalle {w}""", p)[0]

    serie = consultar(
        f"""SELECT to_char(date_trunc('{gran}', fecha), 'YYYY-MM-DD'), {metrica}
            FROM ventas_detalle {w} GROUP BY 1 ORDER BY 1""", p)

    w_cat, p_cat = filtros(excluir=("categoria",))
    por_categoria = consultar(
        f"SELECT categoria, {metrica} FROM ventas_detalle {w_cat} GROUP BY 1 ORDER BY 2 DESC", p_cat)

    w_ciu, p_ciu = filtros(excluir=("ciudad",))
    por_ciudad = consultar(
        f"SELECT ciudad, {metrica} FROM ventas_detalle {w_ciu} GROUP BY 1 ORDER BY 2 DESC", p_ciu)

    top_productos = consultar(
        f"""SELECT producto, categoria, SUM(cantidad), SUM(ingreso)
            FROM ventas_detalle {w} GROUP BY 1, 2 ORDER BY {metrica} DESC LIMIT 5""", p)

    return jsonify(
        kpis={"ingresos": kpi[0], "unidades": kpi[1], "ventas": kpi[2], "ticket_promedio": kpi[3]},
        serie=serie,
        por_categoria=por_categoria,
        por_ciudad=por_ciudad,
        top_productos=top_productos,
        servidor={"web": socket.gethostname(), "db": os.environ["DB_HOST"]},
    )


@app.get("/api/ventas")
def listar_ventas():
    """Detalle de ventas con búsqueda, orden y paginación."""
    w, p = filtros()
    q = request.args.get("q", "").strip()
    if q:
        w += (" AND " if w else "WHERE ") + "(producto ILIKE %s OR ciudad ILIKE %s OR categoria ILIKE %s)"
        p += [f"%{q}%"] * 3

    orden = COLUMNAS_ORDEN.get(request.args.get("orden"), "id")
    direccion = "ASC" if request.args.get("dir") == "asc" else "DESC"
    try:
        tamano = min(max(int(request.args.get("tamano", 10)), 1), 100)
        pagina = max(int(request.args.get("pagina", 1)), 1)
    except ValueError:
        return jsonify(error="Paginación inválida"), 400

    total = consultar(f"SELECT COUNT(*) FROM ventas_detalle {w}", p)[0][0]
    filas = consultar(
        f"""SELECT id, fecha, producto, categoria, ciudad, cantidad, ingreso
            FROM ventas_detalle {w}
            ORDER BY {orden} {direccion}, id DESC
            LIMIT %s OFFSET %s""", p + [tamano, (pagina - 1) * tamano])

    return jsonify(total=total, pagina=pagina, tamano=tamano, filas=filas)


@app.post("/api/ventas")
def registrar_venta():
    """Registra una venta nueva en el contenedor de base de datos."""
    d = request.get_json(silent=True) or {}
    try:
        producto_id = int(d["producto_id"])
        cantidad = int(d["cantidad"])
        ciudad = str(d["ciudad"]).strip()
        fecha = date.fromisoformat(d.get("fecha") or date.today().isoformat())
        if cantidad <= 0 or not ciudad:
            raise ValueError
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Datos inválidos"), 400

    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ventas (fecha, producto_id, ciudad, cantidad) VALUES (%s,%s,%s,%s) RETURNING id",
                (fecha, producto_id, ciudad, cantidad))
            nuevo_id = cur.fetchone()[0]
    except psycopg2.errors.ForeignKeyViolation:
        return jsonify(error="El producto no existe"), 400
    finally:
        conn.close()
    return jsonify(ok=True, id=nuevo_id), 201


@app.delete("/api/ventas/<int:venta_id>")
def eliminar_venta(venta_id):
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM ventas WHERE id = %s", (venta_id,))
            borradas = cur.rowcount
    finally:
        conn.close()
    if not borradas:
        return jsonify(error="La venta no existe"), 404
    return jsonify(ok=True)


@app.get("/api/exportar.csv")
def exportar_csv():
    """Descarga en CSV las ventas que cumplen los filtros activos."""
    w, p = filtros()
    filas = consultar(
        f"""SELECT id, fecha, producto, categoria, ciudad, cantidad, precio, ingreso
            FROM ventas_detalle {w} ORDER BY fecha, id""", p)
    salida = io.StringIO()
    escritor = csv.writer(salida)
    escritor.writerow(["id", "fecha", "producto", "categoria", "ciudad", "cantidad", "precio", "ingreso"])
    escritor.writerows(filas)
    # BOM para que Excel muestre bien las tildes
    return Response("﻿" + salida.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=ventas.csv"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
