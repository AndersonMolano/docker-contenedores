# Imagen base oficial con versión fija (nunca "latest")
FROM python:3.12-slim

WORKDIR /app

# Dependencias primero para aprovechar la caché de capas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código de la aplicación
COPY app.py .
COPY templates/ templates/

# Puerto que expone la API dentro del contenedor
EXPOSE 5000

# Comando de inicio
CMD ["python", "app.py"]
