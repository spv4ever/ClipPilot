import { useEffect, useMemo, useState } from "react";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const authLink = `${backendUrl}/auth/google`;

const formatEmail = (emails) => {
  if (!emails || emails.length === 0) return "";
  return emails[0].value;
};

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
  const [tagQuery, setTagQuery] = useState("");
  const [tagImages, setTagImages] = useState([]);
  const [tagLoading, setTagLoading] = useState(false);

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const email = useMemo(() => formatEmail(user?.emails), [user]);
  const userRole = useMemo(() => user?.role || "free", [user]);
  const normalizedTagQuery = tagQuery.trim().toLowerCase();

  const isAuthenticated = status === "authenticated" && user;

  const loadAccounts = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/accounts`, {
        credentials: "include",
      });

      if (response.status === 401) {
        setAccounts([]);
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar las cuentas.");
      }

      const payload = await response.json();
      setAccounts(payload.accounts || []);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las cuentas guardadas.");
    }
  };

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
      loadAccounts();
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

  useEffect(() => {
    if (!selectedLibrary) return;
    const account = accounts.find(
      (item) => item.id === selectedLibrary.accountId
    );
    const library = account?.libraries?.find(
      (item) => item.id === selectedLibrary.libraryId
    );
    if (!account || !library) {
      setSelectedLibrary(null);
      setView("home");
    }
  }, [accounts, selectedLibrary]);

  useEffect(() => {
    let isActive = true;

    const fetchTagImages = async () => {
      if (!normalizedTagQuery || !selectedLibrary) {
        setTagImages([]);
        return;
      }

      setTagLoading(true);
      try {
        const params = new URLSearchParams({
          tag: normalizedTagQuery,
          accountId: selectedLibrary.accountId,
        });
        const response = await fetch(`${backendUrl}/api/images?${params}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("No se pudieron cargar las imágenes.");
        }

        const payload = await response.json();
        if (isActive) {
          setTagImages(payload.images || []);
        }
      } catch (err) {
        console.error(err);
        if (isActive) {
          setError("No se pudieron cargar las imágenes del tag.");
        }
      } finally {
        if (isActive) {
          setTagLoading(false);
        }
      }
    };

    fetchTagImages();

    return () => {
      isActive = false;
    };
  }, [backendUrl, normalizedTagQuery, selectedLibrary]);

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setStatus("guest");
      setAccounts([]);
      setSelectedLibrary(null);
    } catch (err) {
      console.error(err);
      setError("No se pudo cerrar sesión.");
    }
  };

  const handleDraftChange = (field) => (event) => {
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    if (!draft.name || !draft.cloudName || !draft.apiKey) return;

    try {
      const isEditing = Boolean(editingId);
      const url = isEditing
        ? `${backendUrl}/api/accounts/${editingId}`
        : `${backendUrl}/api/accounts`;
      const method = isEditing ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draft.name,
          cloudName: draft.cloudName,
          apiKey: draft.apiKey,
          apiSecret: draft.apiSecret,
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo guardar la cuenta.");
      }

      const payload = await response.json();
      setAccounts((prev) => {
        if (isEditing) {
          return prev.map((account) =>
            account.id === payload.account.id ? payload.account : account
          );
        }
        return [...prev, payload.account];
      });
      setEditingId(null);
      setDraft(emptyAccountDraft);
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la cuenta.");
    }
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

  const handleDelete = async (accountId) => {
    try {
      const response = await fetch(`${backendUrl}/api/accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la cuenta.");
      }

      setAccounts((prev) => prev.filter((account) => account.id !== accountId));
      if (selectedLibrary?.accountId === accountId) {
        setSelectedLibrary(null);
        setView("home");
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo eliminar la cuenta.");
    }
  };

  const handleLibraryAdd = async (accountId, event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = formData.get("libraryName");
    const tag = formData.get("libraryTag");
    const imageCount = Number(formData.get("libraryCount") || 0);
    if (!name || !tag) return;

    try {
      const response = await fetch(
        `${backendUrl}/api/accounts/${accountId}/libraries`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, tag, imageCount }),
        }
      );

      if (!response.ok) {
        throw new Error("No se pudo guardar la biblioteca.");
      }

      const payload = await response.json();
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === payload.account.id ? payload.account : account
        )
      );
      form.reset();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la biblioteca.");
    }
  };

  const handleLibraryRemove = async (accountId, libraryId) => {
    try {
      const response = await fetch(
        `${backendUrl}/api/accounts/${accountId}/libraries/${libraryId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("No se pudo eliminar la biblioteca.");
      }

      const payload = await response.json();
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === payload.account.id ? payload.account : account
        )
      );
      if (selectedLibrary?.libraryId === libraryId) {
        setSelectedLibrary(null);
        setView("home");
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo eliminar la biblioteca.");
    }
  };

  const totalImagesForAccount = (account) =>
    (account.libraries || []).reduce(
      (total, library) => total + (library.imageCount || 0),
      0
    );

  const librariesForHome = accounts
    .map(
      (account) =>
        account.libraries?.[0] && { account, library: account.libraries[0] }
    )
    .filter(Boolean);

  const openLibrary = (account, library) => {
    setSelectedLibrary({ accountId: account.id, libraryId: library.id });
    setPage(1);
    setTagQuery("");
    setTagImages([]);
    setView("library");
  };

  const pageSize = 50;
  const selectedAccount = selectedLibrary
    ? accounts.find((account) => account.id === selectedLibrary.accountId)
    : null;
  const selectedLibraryData = selectedAccount?.libraries?.find(
    (library) => library.id === selectedLibrary?.libraryId
  );
  const placeholderImages = selectedLibraryData
    ? Array.from({ length: selectedLibraryData.imageCount || 0 }, (_, index) => ({
        id: `${selectedLibraryData.id}-${index + 1}`,
        label: `Imagen ${index + 1}`,
        tag: selectedLibraryData.tag,
      }))
    : [];
  const activeImages = normalizedTagQuery ? tagImages : placeholderImages;
  const paginatedImages = activeImages.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(activeImages.length / pageSize));

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
                        name="libraryTag"
                        type="text"
                        placeholder="Tag (ej: verano-2024)"
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
                            <span className="muted">Tag: {library.tag}</span>
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

      {view === "library" && selectedLibrary && selectedLibraryData && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h1>{selectedLibraryData.name}</h1>
              <p className="subtitle">
                {selectedAccount?.name} · {selectedLibraryData.imageCount}
                {" "}imágenes disponibles
              </p>
              <p className="subtitle">
                Tag principal: {selectedLibraryData.tag}
              </p>
            </div>
            <button className="secondary" onClick={() => setView("home")}> 
              Volver a inicio
            </button>
          </header>
          <section className="card">
            <h3>Buscar imágenes por tag en esta cuenta</h3>
            <p className="subtitle">
              Escribe un tag para ver todas las imágenes de las bibliotecas que lo usan.
            </p>
            <input
              type="text"
              placeholder="Ej: verano-2024"
              value={tagQuery}
              onChange={(event) => {
                setTagQuery(event.target.value);
                setPage(1);
              }}
            />
            {normalizedTagQuery && (
              <p className="subtitle">
                Resultados para "{normalizedTagQuery}": {tagImages.length} imágenes.
              </p>
            )}
            {tagLoading && <p className="subtitle">Cargando imágenes...</p>}
          </section>
          <section className="image-grid">
            {paginatedImages.map((image, index) => (
              <div className="image-card" key={image.id}>
                <div className="image-thumb">{index + 1 + (page - 1) * pageSize}</div>
                <p>{image.label}</p>
                {image.libraryName && (
                  <p className="muted">Biblioteca: {image.libraryName}</p>
                )}
                {image.tag && <p className="muted">Tag: {image.tag}</p>}
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
