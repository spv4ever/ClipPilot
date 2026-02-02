import { useEffect, useMemo, useState } from "react";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const authLink = `${backendUrl}/auth/google`;

const formatEmail = (emails) => {
  if (!emails || emails.length === 0) return "";
  return emails[0].value;
};

const parseLibraries = (value) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [libraryInput, setLibraryInput] = useState("");
  const [libraries, setLibraries] = useState(["marketing", "productos"]);

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const email = useMemo(() => formatEmail(user?.emails), [user]);
  const userRole = useMemo(() => user?.role || "free", [user]);

  const fetchMe = async () => {
    try {
      setStatus("checking");
      const response = await fetch(`${backendUrl}/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        setStatus("guest");
        return;
      }

      const payload = await response.json();
      setUser(payload.user);
      setStatus("authenticated");
    } catch (err) {
      console.error(err);
      setError("No se pudo conectar con el backend.");
      setStatus("guest");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "gmail-only") {
      setLoginError("Solo se permite iniciar sesión con cuentas de Gmail.");
    } else if (errorParam) {
      setLoginError("No se pudo iniciar sesión. Inténtalo de nuevo.");
    }
    fetchMe();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setStatus("guest");
    } catch (err) {
      console.error(err);
      setError("No se pudo cerrar sesión.");
    }
  };

  const handleLibrarySubmit = (event) => {
    event.preventDefault();
    const nextLibraries = parseLibraries(libraryInput);
    if (nextLibraries.length === 0) return;
    setLibraries((prev) => Array.from(new Set([...prev, ...nextLibraries])));
    setLibraryInput("");
  };

  const handleLibraryRemove = (library) => {
    setLibraries((prev) => prev.filter((item) => item !== library));
  };

  const isAuthenticated = status === "authenticated" && user;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <p className="eyebrow">ClipPilot</p>
        </div>
        <div className="topbar-actions">
          {isAuthenticated ? (
            <div className="topbar-user">
              {user.photos?.[0]?.value && (
                <img src={user.photos[0].value} alt={displayName} />
              )}
              <div>
                <strong>{displayName}</strong>
                <span className="role">Plan {userRole}</span>
              </div>
              <button className="secondary" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <a className="primary" href={authLink}>
              Login con Gmail
            </a>
          )}
        </div>
      </header>

      <main className="card profile">
        <header>
          <p className="eyebrow">Perfil</p>
          <h1>Configuración de tu cuenta</h1>
          <p className="subtitle">
            Centraliza los datos de tu usuario y conecta tus bibliotecas de
            Cloudinary para usar ClipPilot.
          </p>
        </header>

        {loginError && <p className="error">{loginError}</p>}
        {error && <p className="error">{error}</p>}

        {isAuthenticated ? (
          <section className="user">
            {user.photos?.[0]?.value && (
              <img src={user.photos[0].value} alt={displayName} />
            )}
            <div>
              <h2>Hola, {displayName}</h2>
              <p>{email}</p>
              <p className="meta">
                Plan: {userRole} · ID: {user.dbId || user.id}
              </p>
            </div>
          </section>
        ) : (
          <section className="cta">
            <p>Inicia sesión con Gmail para personalizar tu perfil.</p>
            <a className="primary" href={authLink}>
              Continuar con Gmail
            </a>
          </section>
        )}

        <section className="panel">
          <div>
            <h3>Bibliotecas de Cloudinary</h3>
            <p className="panel-subtitle">
              Agrega una o varias bibliotecas para sincronizar tus clips.
            </p>
          </div>
          <form className="library-form" onSubmit={handleLibrarySubmit}>
            <label htmlFor="library">Nombre de biblioteca</label>
            <div className="library-input">
              <input
                id="library"
                type="text"
                placeholder="Ej: brand-assets, producto-lanzamiento"
                value={libraryInput}
                onChange={(event) => setLibraryInput(event.target.value)}
                disabled={!isAuthenticated}
              />
              <button className="primary" type="submit" disabled={!isAuthenticated}>
                Agregar
              </button>
            </div>
            <p className="helper">
              Puedes escribir varios nombres separados por comas.
            </p>
          </form>

          <div className="library-list">
            {libraries.length > 0 ? (
              libraries.map((library) => (
                <span className="tag" key={library}>
                  {library}
                  <button
                    type="button"
                    onClick={() => handleLibraryRemove(library)}
                    aria-label={`Eliminar ${library}`}
                    disabled={!isAuthenticated}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <p className="empty">Aún no has agregado bibliotecas.</p>
            )}
          </div>
        </section>

        <footer>
          <p>
            Backend: <span>{backendUrl}</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
