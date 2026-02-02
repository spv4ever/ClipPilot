# ClipForge (Parte 1 - Base del proyecto)

Backend base con **Python 3.12**, **FastAPI** y **MongoDB Atlas** (Motor). Incluye conexión real a Atlas y endpoint de salud.

## Requisitos
- Python 3.12
- Cuenta y cluster en MongoDB Atlas

## Checklist de MongoDB Atlas
1. Crear un **cluster** (M0 sirve para pruebas).
2. Crear un **usuario** de base de datos.
3. Configurar **Network Access** (agregar tu IP actual o 0.0.0.0/0 para pruebas).
4. Obtener el **connection string** `mongodb+srv://...` y completar `.env`.
5. Asegurar que el nombre de DB en el string coincida con `MONGODB_DB`.

## Estructura
```
/backend
  /app
    /api/routers/health.py
    /core/config.py
    /core/logging.py
    /db/mongo.py
    /models/user.py
    main.py
  .env.example
  requirements.txt
```

## Configuración
1. Copia el archivo de ejemplo y actualiza valores:
   - `backend/.env.example` ➜ `backend/.env`

### Ejemplo de variables
```
ENV=dev
MONGODB_URI=mongodb+srv://<USER>:<PASSWORD>@<CLUSTER_HOST>/<DBNAME>?retryWrites=true&w=majority&appName=ClipForge
MONGODB_DB=clipforge
REDIS_URL=redis://localhost:6379/0
SESSION_SECRET=change_me
```

## Instalación y arranque (Linux/macOS)
```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Instalación y arranque (Windows PowerShell)
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Verificación rápida
- Endpoint de salud (ping real a MongoDB):
  - `GET http://127.0.0.1:8000/health`
  - Respuesta esperada: `{"status":"ok","mongo":"ok"}`

## Notas
- **No hay Docker** ni Postgres en esta fase.
- La conexión usa `mongodb+srv://` y requiere `dnspython`.
