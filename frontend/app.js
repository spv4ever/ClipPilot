import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const DASHBOARD_METRICS = [
  { label: "Clips en revisión", value: "12", detail: "+3 desde ayer" },
  { label: "Programados", value: "24", detail: "para los próximos 7 días" },
  { label: "Colaboradores", value: "6", detail: "activos hoy" },
];

const QUICK_METRICS = [
  { label: "Alcance", value: "128k" },
  { label: "CTR", value: "5.4%" },
  { label: "Me gusta", value: "9.1k" },
];

const AGENDA_ITEMS = [
  { time: "10:00", label: "Reunión con equipo de contenido" },
  { time: "13:30", label: "Grabación de clips promocionales" },
  { time: "17:00", label: "Publicación de campaña estacional" },
];

const CHECKLIST_ITEMS = [
  { label: "Revisar copy final de campaña urbana", done: true },
  { label: "Agregar música a clip “Behind the scenes”", done: false },
  { label: "Enviar aprobaciones a cliente premium", done: false },
];

const STORAGE_KEY = "clipforge.session";

const decodeJwtPayload = (token) => {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized);
  const json = decodeURIComponent(
    decoded
      .split("")
      .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join("")
  );

  return JSON.parse(json);
};

const loadSession = () => {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
};

const saveSession = (user) => {
  if (!user) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

const AuthPanel = ({ clientId, onLogin, onDemo }) => {
  useEffect(() => {
    if (!clientId || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response?.credential) {
          return;
        }

        const profile = decodeJwtPayload(response.credential);
        if (!profile) {
          return;
        }

        onLogin({
          name: profile.name,
          email: profile.email,
          avatar: profile.picture,
        });
      },
    });

    window.google.accounts.id.renderButton(
      document.getElementById("google-signin"),
      {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 320,
      }
    );
  }, [clientId, onLogin]);

  return (
    <main className="auth">
      <section className="auth__panel">
        <div className="auth__brand">
          <span className="badge">ClipForge</span>
          <h1>Accede a tu panel creativo</h1>
          <p>
            Inicia sesión con Google para gestionar tus proyectos, revisar
            métricas y publicar clips en minutos.
          </p>
        </div>
        <div className="auth__form">
          <div className="field">
            <span>Cuenta corporativa</span>
            <input type="text" value="equipo@clipforge.io" readOnly />
          </div>
          <div className="field">
            <span>Entorno de acceso</span>
            <input type="text" value="Producción" readOnly />
          </div>
          <div className="auth__actions">
            <div id="google-signin" className="google-button" />
            <button className="button button--ghost" type="button" onClick={onDemo}>
              Entrar con demo
            </button>
          </div>
          {!clientId && (
            <p className="helper helper--warning">
              Agrega tu Google Client ID en el atributo
              <strong> data-google-client-id </strong> de este documento para
              activar el inicio de sesión.
            </p>
          )}
          <p className="helper">
            ¿Necesitas ayuda? Contacta a soporte y recibe la activación en minutos.
          </p>
        </div>
      </section>
      <aside className="auth__card">
        <h2>Todo tu flujo en un solo lugar</h2>
        <ul>
          <li>Calendario de publicaciones inteligente.</li>
          <li>Plantillas listas para reels y shorts.</li>
          <li>Equipo colaborando en tiempo real.</li>
        </ul>
        <div className="auth__metrics">
          <div>
            <strong>+32%</strong>
            <span>Engagement</span>
          </div>
          <div>
            <strong>4.8</strong>
            <span>Tiempo ahorrado</span>
          </div>
        </div>
      </aside>
    </main>
  );
};

const Dashboard = ({ user, onLogout }) => (
  <div className="page page--dashboard">
    <header className="topbar">
      <div className="brand">
        <span className="badge badge--dark">ClipForge</span>
        <span className="brand__name">Panel principal</span>
      </div>
      <div className="topbar__profile">
        <div className="profile">
          {user.avatar ? (
            <img src={user.avatar} alt={`Foto de ${user.name}`} />
          ) : (
            <span>{user.name.slice(0, 2).toUpperCase()}</span>
          )}
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
        <div className="topbar__actions">
          <button className="button button--ghost" type="button">
            Notificaciones
          </button>
          <button className="button button--primary" type="button">
            Nuevo clip
          </button>
          <button className="button button--link" type="button" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>

    <main className="dashboard">
      <section className="dashboard__summary">
        <h1>Hola, {user.name.split(" ")[0]} 👋</h1>
        <p>
          Aquí tienes el estado general de tus campañas y el progreso del
          contenido listo para publicación.
        </p>
        <div className="summary__cards">
          {DASHBOARD_METRICS.map((metric) => (
            <article key={metric.label}>
              <h3>{metric.label}</h3>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard__grid">
        <article className="panel">
          <header>
            <h2>Checklist de publicación</h2>
            <button className="button button--link" type="button">
              Ver todo
            </button>
          </header>
          <ul className="checklist">
            {CHECKLIST_ITEMS.map((item) => (
              <li key={item.label}>
                <input type="checkbox" defaultChecked={item.done} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <header>
            <h2>Métricas rápidas</h2>
            <button className="button button--link" type="button">
              Reporte
            </button>
          </header>
          <div className="metrics">
            {QUICK_METRICS.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel panel--wide">
          <header>
            <h2>Agenda de hoy</h2>
            <button className="button button--link" type="button">
              Calendario
            </button>
          </header>
          <div className="agenda">
            {AGENDA_ITEMS.map((item) => (
              <div key={item.time}>
                <h4>{item.time}</h4>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  </div>
);

const App = () => {
  const root = document.getElementById("root");
  const clientId = root.dataset.googleClientId;
  const [user, setUser] = useState(loadSession());

  useEffect(() => {
    saveSession(user);
  }, [user]);

  const demoUser = useMemo(
    () => ({
      name: "Equipo Demo",
      email: "demo@clipforge.io",
      avatar: "",
    }),
    []
  );

  if (user) {
    return <Dashboard user={user} onLogout={() => setUser(null)} />;
  }

  return (
    <AuthPanel
      clientId={clientId}
      onLogin={setUser}
      onDemo={() => setUser(demoUser)}
    />
  );
};

const root = createRoot(document.getElementById("root"));
root.render(<App />);
