import { useEffect, useMemo, useState } from "react";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const authLink = `${backendUrl}/auth/google`;

const formatEmail = (emails) => {
  if (!emails || emails.length === 0) return "";
  return emails[0].value;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <p className="eyebrow">ClipPilot</p>
        </div>
        <div className="topbar-actions">
          {status === "authenticated" && user ? (
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

      <main className="card">
        <header>
          <h1>Acceso con Gmail</h1>
          <p className="subtitle">
            Solo permitimos cuentas Gmail. Los nuevos usuarios se registran con
            el plan free y un ID asignado.
          </p>
        </header>

        {loginError && <p className="error">{loginError}</p>}
        {error && <p className="error">{error}</p>}

        {status === "authenticated" && user ? (
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
            <p>Inicia sesión con Gmail para comenzar.</p>
            <a className="primary" href={authLink}>
              Continuar con Gmail
            </a>
          </section>
        )}

        <footer>
          <p>
            Backend: <span>{backendUrl}</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
