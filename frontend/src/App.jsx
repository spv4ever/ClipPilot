import { useEffect, useMemo, useState } from "react";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const authLink = `${backendUrl}/auth/google`;

const formatEmail = (emails) => {
  if (!emails || emails.length === 0) return "";
  return emails[0].value;
};

const buildImageSet = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `img-${index + 1}`,
    label: `Imagen ${index + 1}`,
  }));

const emptyAccountDraft = {
  id: "",
  name: "",
  cloudName: "",
  apiKey: "",
  apiSecret: "",
};

const steps = [
  "Crea o entra en tu panel de Cloudinary.",
  "Ve a Settings → Access Keys para copiar Cloud name, API Key y API Secret.",
  "Regresa aquí y registra tu cuenta para sincronizar tus bibliotecas.",
  "Añade al menos una librería para que podamos listar tus imágenes.",
];

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState("home");
  const [accounts, setAccounts] = useState([]);
  const [draft, setDraft] = useState(emptyAccountDraft);
  const [editingId, setEditingId] = useState(null);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [page, setPage] = useState(1);

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const email = useMemo(() => formatEmail(user?.emails), [user]);
  const userRole = useMemo(() => user?.role || "free", [user]);

  const isAuthenticated = status === "authenticated" && user;

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

  const handleDraftChange = (field) => (event) => {
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAccountSubmit = (event) => {
    event.preventDefault();
    if (!draft.name || !draft.cloudName || !draft.apiKey) return;

    if (editingId) {
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === editingId
            ? {
                ...account,
                ...draft,
                id: editingId,
              }
            : account
        )
      );
      setEditingId(null);
    } else {
      const id = `acct-${Date.now()}`;
      setAccounts((prev) => [
        ...prev,
        {
          ...draft,
          id,
          libraries: [],
        },
      ]);
    }

    setDraft(emptyAccountDraft);
  };

  const handleEdit = (account) => {
    setDraft({
      id: account.id,
      name: account.name,
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
    setEditingId(account.id);
  };

  const handleDelete = (accountId) => {
    setAccounts((prev) => prev.filter((account) => account.id !== accountId));
  };

  const handleLibraryAdd = (accountId, event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = formData.get("libraryName");
    const imageCount = Number(formData.get("libraryCount") || 0);
    if (!name) return;

    setAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== accountId) return account;
        const libraries = account.libraries || [];
        return {
          ...account,
          libraries: [
            ...libraries,
            {
              id: `${accountId}-${name}`,
              name,
              imageCount,
              images: buildImageSet(imageCount),
            },
          ],
        };
      })
    );

    form.reset();
  };

  const handleLibraryRemove = (accountId, libraryId) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === accountId
          ? {
              ...account,
              libraries: account.libraries.filter(
                (library) => library.id !== libraryId
              ),
            }
          : account
      )
    );
  };

  const totalImagesForAccount = (account) =>
    (account.libraries || []).reduce(
      (total, library) => total + (library.imageCount || 0),
      0
    );

  const librariesForHome = accounts
    .map((account) => account.libraries?.[0] && { account, library: account.libraries[0] })
    .filter(Boolean);

  const openLibrary = (account, library) => {
    setSelectedLibrary({ account, library });
    setPage(1);
    setView("library");
  };

  const pageSize = 50;
  const paginatedImages = selectedLibrary
    ? selectedLibrary.library.images.slice((page - 1) * pageSize, page * pageSize)
    : [];
  const totalPages = selectedLibrary
    ? Math.max(1, Math.ceil(selectedLibrary.library.images.length / pageSize))
    : 1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <p className="eyebrow">ClipPilot</p>
        </div>
        <div className="topbar-actions">
          {isAuthenticated ? (
            <button className="user-pill" onClick={() => setView("cloudinary")}> 
              {user.photos?.[0]?.value && (
                <img src={user.photos[0].value} alt={displayName} />
              )}
              <div>
                <strong>{displayName}</strong>
                <span className="role">Plan {userRole}</span>
              </div>
            </button>
          ) : (
            <a className="primary" href={authLink}>
              Login con Gmail
            </a>
          )}
          {isAuthenticated && (
            <button className="secondary" onClick={handleLogout}>
              Cerrar sesión
            </button>
          )}
        </div>
      </header>

      {loginError && <p className="error">{loginError}</p>}
      {error && <p className="error">{error}</p>}

      {view === "home" && (
        <main className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Bibliotecas Cloudinary</p>
            <h1>ClipPilot</h1>
            <p className="subtitle">
              Gestiona tus cuentas y accede a tus bibliotecas visuales en un solo lugar.
            </p>
          </div>
          <section className="library-grid">
            {librariesForHome.length > 0 ? (
              librariesForHome.map(({ account, library }) => (
                <button
                  key={library.id}
                  className="library-card"
                  onClick={() => openLibrary(account, library)}
                >
                  <div className="library-icon">📁</div>
                  <div>
                    <strong>{library.name}</strong>
                    <p>
                      {account.name} · {library.imageCount} imágenes
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <h2>Sin bibliotecas aún</h2>
                <p>
                  Haz clic en tu usuario para conectar cuentas de Cloudinary y
                  mostrar tus librerías aquí.
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      {view === "cloudinary" && (
        <main className="cloudinary">
          <header className="cloudinary-header">
            <div>
              <p className="eyebrow">Gestión de Cloudinary</p>
              <h1>Conecta tus cuentas</h1>
              <p className="subtitle">
                Guarda varias cuentas y define qué bibliotecas sincronizar.
              </p>
            </div>
            <button className="secondary" onClick={() => setView("home")}>
              Volver a inicio
            </button>
          </header>

          <section className="steps">
            <h3>Pasos para autorizar el acceso</h3>
            <ol>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="card account-form">
            <h3>{editingId ? "Editar cuenta" : "Nueva cuenta"}</h3>
            <form onSubmit={handleAccountSubmit}>
              <div className="form-grid">
                <label>
                  Nombre visible
                  <input
                    type="text"
                    value={draft.name}
                    onChange={handleDraftChange("name")}
                    placeholder="Ej: Marketing Latam"
                  />
                </label>
                <label>
                  Cloud name
                  <input
                    type="text"
                    value={draft.cloudName}
                    onChange={handleDraftChange("cloudName")}
                    placeholder="tu-cloud-name"
                  />
                </label>
                <label>
                  API Key
                  <input
                    type="text"
                    value={draft.apiKey}
                    onChange={handleDraftChange("apiKey")}
                    placeholder="1234567890"
                  />
                </label>
                <label>
                  API Secret
                  <input
                    type="password"
                    value={draft.apiSecret}
                    onChange={handleDraftChange("apiSecret")}
                    placeholder="••••••••"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button className="primary" type="submit">
                  {editingId ? "Guardar cambios" : "Agregar cuenta"}
                </button>
                {editingId && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setDraft(emptyAccountDraft);
                      setEditingId(null);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="account-grid">
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <article className="card account" key={account.id}>
                  <header className="account-header">
                    <div>
                      <h3>{account.name}</h3>
                      <p>Cloud name: {account.cloudName}</p>
                      <p>Total imágenes: {totalImagesForAccount(account)}</p>
                    </div>
                    <div className="account-actions">
                      <button
                        className="secondary"
                        onClick={() => handleEdit(account)}
                      >
                        Editar
                      </button>
                      <button
                        className="secondary danger"
                        onClick={() => handleDelete(account.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </header>

                  <div className="library-section">
                    <div className="library-header">
                      <h4>Bibliotecas</h4>
                      <span>
                        {(account.libraries || []).length} bibliotecas
                      </span>
                    </div>
                    <form
                      className="library-form"
                      onSubmit={(event) => handleLibraryAdd(account.id, event)}
                    >
                      <input
                        name="libraryName"
                        type="text"
                        placeholder="Nombre de biblioteca"
                      />
                      <input
                        name="libraryCount"
                        type="number"
                        min="0"
                        placeholder="Imágenes"
                      />
                      <button className="primary" type="submit">
                        Añadir biblioteca
                      </button>
                    </form>
                    <div className="library-list">
                      {(account.libraries || []).length > 0 ? (
                        account.libraries.map((library) => (
                          <button
                            key={library.id}
                            type="button"
                            className="library-pill"
                            onClick={() => openLibrary(account, library)}
                          >
                            <span>{library.name}</span>
                            <span className="muted">
                              {library.imageCount} imágenes
                            </span>
                            <span
                              className="remove"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleLibraryRemove(account.id, library.id);
                              }}
                            >
                              ×
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="empty">Aún no has agregado bibliotecas.</p>
                      )}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <h2>Sin cuentas registradas</h2>
                <p>
                  Crea una cuenta para empezar a sincronizar tus bibliotecas y
                  visualizar imágenes en ClipPilot.
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      {view === "library" && selectedLibrary && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h1>{selectedLibrary.library.name}</h1>
              <p className="subtitle">
                {selectedLibrary.account.name} · {selectedLibrary.library.imageCount}
                {" "}imágenes disponibles
              </p>
            </div>
            <button className="secondary" onClick={() => setView("home")}> 
              Volver a inicio
            </button>
          </header>
          <section className="image-grid">
            {paginatedImages.map((image, index) => (
              <div className="image-card" key={image.id}>
                <div className="image-thumb">{index + 1 + (page - 1) * pageSize}</div>
                <p>{image.label}</p>
              </div>
            ))}
          </section>
          <footer className="pagination">
            <button
              className="secondary"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              className="secondary"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Siguiente
            </button>
          </footer>
        </main>
      )}
    </div>
  );
}
