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

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const email = useMemo(() => formatEmail(user?.emails), [user]);

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
      <main className="card">
        <header>
          <p className="eyebrow">ClipPilot</p>
          <h1>Login con Google</h1>
          <p className="subtitle">
            Autentícate con Google para que frontend y backend estén sincronizados.
          </p>
        </header>

        {error && <p className="error">{error}</p>}

        {status === "authenticated" && user ? (
          <section className="user">
            {user.photos?.[0]?.value && (
              <img src={user.photos[0].value} alt={displayName} />
            )}
            <div>
              <h2>Hola, {displayName}</h2>
              <p>{email}</p>
            </div>
            <button className="secondary" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </section>
        ) : (
          <section className="cta">
            <p>Inicia sesión para comenzar.</p>
            <a className="primary" href={authLink}>
              Continuar con Google
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
