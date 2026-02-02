# ClipPilot - Reset global (Node.js + React)

Proyecto refactorizado para que **backend (Node.js + Express)** y **frontend (React + Vite)** trabajen juntos con el objetivo principal de **login con Google**.

## Requisitos (Windows 11)
- **Node.js 18+** (incluye npm)
- Cuenta de Google Cloud con OAuth 2.0 configurado

## Configuración de variables de entorno

### Backend
1. Copia el ejemplo:
   - `backend/.env.example` ➜ `backend/.env`
2. Completa los valores:

```
PORT=4000
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
SESSION_SECRET=cambia-esto
```

> En Google Cloud Console, agrega como **Authorized redirect URI** el valor de `GOOGLE_CALLBACK_URL`.

### Frontend
1. Copia el ejemplo:
   - `frontend/.env.example` ➜ `frontend/.env`
2. Completa el backend:

```
VITE_BACKEND_URL=http://localhost:4000
```

## Arranque del backend (Windows 11)
```powershell
cd backend
npm install
npm run dev
```

El backend queda en `http://localhost:4000`.

## Arranque del frontend (Windows 11)
```powershell
cd frontend
npm install
npm run dev
```

El frontend queda en `http://localhost:5173`.

## Flujo de login con Google
1. Abre `http://localhost:5173`.
2. Pulsa **Continuar con Google**.
3. Acepta el acceso en Google.
4. Serás redirigido al frontend con la sesión activa.

## Endpoints útiles
- `GET /health` → estado del backend.
- `GET /auth/google` → inicia OAuth.
- `GET /auth/google/callback` → callback de Google.
- `GET /auth/me` → devuelve el usuario autenticado.
- `POST /auth/logout` → cierra sesión.
