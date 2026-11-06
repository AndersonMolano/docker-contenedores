import os

import psycopg2
from flask import Flask, jsonify, request

app = Flask(__name__)


def get_connection():
    # DB_HOST es el NOMBRE DEL SERVICIO en docker-compose.yml ("db"),
    # Docker lo resuelve por DNS dentro de la red. No se usa localhost ni IP fija.
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def init_db():
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS notas (
                id SERIAL PRIMARY KEY,
                texto TEXT NOT NULL,
                creada TIMESTAMP DEFAULT NOW()
            )
            """
        )


@app.get("/")
def index():
    return jsonify(
        mensaje="API Flask funcionando",
        endpoints=["GET /health", "POST /notas", "GET /notas"],
    )


@app.get("/health")
def health():
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()
    return jsonify(api="ok", base_de_datos="ok", host_db=os.environ["DB_HOST"])


@app.post("/notas")
def crear_nota():
    datos = request.get_json(silent=True) or {}
    texto = datos.get("texto")
    if not texto:
        return jsonify(error="Falta el campo 'texto'"), 400
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO notas (texto) VALUES (%s) RETURNING id", (texto,)
        )
        nuevo_id = cur.fetchone()[0]
    return jsonify(id=nuevo_id, texto=texto), 201


@app.get("/notas")
def listar_notas():
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, texto, creada FROM notas ORDER BY id")
        filas = cur.fetchall()
    return jsonify(
        [{"id": f[0], "texto": f[1], "creada": f[2].isoformat()} for f in filas]
    )


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
