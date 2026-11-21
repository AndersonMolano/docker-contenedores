pipeline {
    agent any

    options {
        skipDefaultCheckout()
        disableConcurrentBuilds()
    }

    environment {
        COMPOSE_PROJECT_NAME = 'entrega2-jenkins-ci'
        POSTGRES_DB = 'notas_ci'
        POSTGRES_USER = 'notas_ci'
        POSTGRES_PASSWORD = credentials('postgres-password-ci')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'docker compose build api db'
            }
        }

        stage('Test') {
            steps {
                sh '''
                    set -eu
                    docker compose up -d --no-build

                    docker compose exec -T api python - <<'PY'
import json
import time
from urllib.request import Request, urlopen
from uuid import uuid4

base_url = "http://127.0.0.1:5000"


def read_json(path, method="GET", payload=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        base_url + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


for attempt in range(30):
    try:
        health = read_json("/health")
        if (
            health.get("api") == "ok"
            and health.get("base_de_datos") == "ok"
            and health.get("host_db") == "db"
        ):
            print("La API se comunica con PostgreSQL por el servicio db.")
            break
    except (OSError, ValueError):
        pass
    time.sleep(1)
else:
    raise SystemExit("La API no confirmó la conexión con el servicio db.")

text = f"Prueba de integracion Jenkins {uuid4()}"
created = read_json("/notas", method="POST", payload={"texto": text})
note_id = created.get("id")
if note_id is None:
    raise SystemExit("POST /notas no devolvió el ID de la nota creada.")

notes = read_json("/notas")
if not any(note.get("id") == note_id and note.get("texto") == text for note in notes):
    raise SystemExit("GET /notas no recuperó la nota creada.")

print(f"Prueba de integración exitosa: nota {note_id} guardada y recuperada.")
PY
                '''
            }
        }
    }

    post {
        always {
            sh '''
                if [ -f docker-compose.yml ]; then
                    docker compose down --volumes
                fi
            '''
        }

        failure {
            echo 'El pipeline falló. Revisa la etapa marcada en rojo y la salida de consola.'
        }
    }
}