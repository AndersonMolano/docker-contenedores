pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        POSTGRES_DB = 'notasdb'
        POSTGRES_USER = 'app_user'
        POSTGRES_PASSWORD = credentials('postgres-password-ci')
        API_PORT = '18080'
        COMPOSE_PROJECT_NAME = "jenkins-ci-${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'docker info'
                sh 'docker compose build --pull api'
                sh 'docker compose pull db'
            }
        }

        stage('Test') {
            steps {
                sh '''
                    docker compose up -d --wait
                    docker compose exec -T api python - <<'PY'
import json
import time
import urllib.request

deadline = time.monotonic() + 60
last_error = None

while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen("http://127.0.0.1:5000/health", timeout=5) as response:
            result = json.load(response)

        assert result.get("api") == "ok", result
        assert result.get("base_de_datos") == "ok", result
        assert result.get("host_db") == "db", result

        print("API and PostgreSQL communication verified via service name 'db'.")
        print(json.dumps({
            "api": result["api"],
            "base_de_datos": result["base_de_datos"],
            "host_db": result["host_db"]
        }))
        break
    except Exception as error:
        last_error = error
        time.sleep(2)
else:
    raise SystemExit(f"Health check failed after retries: {last_error}")
PY
                    docker compose exec -T api python - <<'PY'
import json
import urllib.request

url = "http://127.0.0.1:5000/notas"
payload = json.dumps({"texto": "prueba desde CI"}).encode("utf-8")
request = urllib.request.Request(
    url,
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(request, timeout=10) as response:
    created = json.load(response)
    assert response.status == 201, created
    assert created.get("texto") == "prueba desde CI", created

with urllib.request.urlopen(url, timeout=10) as response:
    notes = json.load(response)
    assert response.status == 200, notes
    assert any(
        note.get("id") == created.get("id")
        and note.get("texto") == "prueba desde CI"
        for note in notes
    ), notes

print("POST /notas and GET /notas verified.")
PY
                '''
            }
        }
    }

    post {
        always {
            script {
                if (fileExists('docker-compose.yml')) {
                    sh 'docker compose down --volumes --remove-orphans'
                }
            }
        }
    }
}