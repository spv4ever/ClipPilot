import { useEffect, useMemo, useRef, useState } from "react";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const authLink = `${backendUrl}/auth/google`;

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
  "Regresa aquí y registra tu cuenta para gestionar tus credenciales.",
];

const storageKeys = {
  view: "clippilot:lastView",
  accountId: "clippilot:lastAccountId",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState("home");
  const [accounts, setAccounts] = useState([]);
  const [accountsStatus, setAccountsStatus] = useState("idle");
  const [draft, setDraft] = useState(emptyAccountDraft);
  const [editingId, setEditingId] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountImages, setAccountImages] = useState([]);
  const [imagesStatus, setImagesStatus] = useState("idle");
  const [imagesError, setImagesError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [imageFilter, setImageFilter] = useState("all");
  const [imageCounts, setImageCounts] = useState({});
  const [imageCountsStatus, setImageCountsStatus] = useState("idle");
  const [reelUpdating, setReelUpdating] = useState({});
  const [reelCount, setReelCount] = useState(5);
  const [reelSecondsPerImage, setReelSecondsPerImage] = useState(2);
  const [reelZoomAmount, setReelZoomAmount] = useState(0.05);
  const [reelCreateStatus, setReelCreateStatus] = useState("idle");
  const [reelCreateError, setReelCreateError] = useState("");
  const [reels, setReels] = useState([]);
  const [reelsStatus, setReelsStatus] = useState("idle");
  const [reelsError, setReelsError] = useState("");
  const hasRestoredView = useRef(false);

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const userRole = useMemo(() => user?.role || "free", [user]);

  const isAuthenticated = status === "authenticated" && user;

  const handleUnauthorized = (response) => {
    if (response.status !== 401) return false;
    setUser(null);
    setStatus("guest");
    setAccounts([]);
    setView("home");
    setLoginError("Tu sesión expiró. Inicia sesión de nuevo.");
    localStorage.removeItem(storageKeys.view);
    localStorage.removeItem(storageKeys.accountId);
    return true;
  };

  const loadAccounts = async () => {
    try {
      setAccountsStatus("loading");
      const response = await fetch(`${backendUrl}/api/accounts`, {
        credentials: "include",
      });

      if (handleUnauthorized(response)) {
        setAccounts([]);
        setAccountsStatus("error");
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar las cuentas.");
      }

      const payload = await response.json();
      setAccounts(payload.accounts || []);
      setAccountsStatus("success");
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las cuentas guardadas.");
      setAccountsStatus("error");
    }
  };

  const loadImages = async ({ accountId, cursor } = {}) => {
    if (!accountId) {
      setAccountImages([]);
      return;
    }

    try {
      setImagesStatus("loading");
      setImagesError("");
      const url = new URL(`${backendUrl}/api/accounts/${accountId}/images`);
      url.searchParams.set("limit", "50");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      if (handleUnauthorized(response)) {
        setAccountImages([]);
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar las imágenes.");
      }

      const payload = await response.json();
      setAccountImages(payload.images || []);
      setNextCursor(payload.nextCursor || null);
      setCurrentCursor(cursor || null);
      setImagesStatus("success");
    } catch (err) {
      console.error(err);
      setImagesError("No se pudieron cargar las imágenes.");
      setImagesStatus("error");
    }
  };

  const loadImageCounts = async (accountsToLoad) => {
    if (!accountsToLoad.length) {
      setImageCounts({});
      return;
    }

    try {
      setImageCountsStatus("loading");
      const results = await Promise.all(
        accountsToLoad.map(async (account) => {
          try {
            const response = await fetch(
              `${backendUrl}/api/accounts/${account.id}/images/count`,
              {
                credentials: "include",
              }
            );

            if (handleUnauthorized(response)) {
              return { id: account.id, totalCount: null, unauthorized: true };
            }

            if (!response.ok) {
              throw new Error("count-failed");
            }

            const payload = await response.json();
            return { id: account.id, totalCount: payload.totalCount };
          } catch (err) {
            console.error(err);
            return { id: account.id, totalCount: null };
          }
        })
      );

      if (results.some((item) => item.unauthorized)) {
        return;
      }

      setImageCounts((prev) => {
        const next = { ...prev };
        results.forEach((item) => {
          next[item.id] = item.totalCount;
        });
        return next;
      });
    } finally {
      setImageCountsStatus("idle");
    }
  };

  const loadReels = async () => {
    try {
      setReelsStatus("loading");
      setReelsError("");
      const response = await fetch(`${backendUrl}/api/reels`, {
        credentials: "include",
      });

      if (handleUnauthorized(response)) {
        setReels([]);
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar los reels.");
      }

      const payload = await response.json();
      setReels(payload.reels || []);
      setReelsStatus("success");
    } catch (err) {
      console.error(err);
      setReelsError("No se pudieron cargar los reels.");
      setReelsStatus("error");
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
    if (!accounts.length) {
      setImageCounts({});
      return;
    }
    if (selectedAccount) {
      const updated = accounts.find((account) => account.id === selectedAccount.id);
      if (updated) {
        setSelectedAccount(updated);
      }
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    if (!accounts.length || !isAuthenticated) {
      return;
    }
    loadImageCounts(accounts);
  }, [accounts, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (view) {
      localStorage.setItem(storageKeys.view, view);
    }
    if (selectedAccount?.id) {
      localStorage.setItem(storageKeys.accountId, selectedAccount.id);
    }
  }, [isAuthenticated, selectedAccount, view]);

  useEffect(() => {
    if (hasRestoredView.current) {
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    if (accountsStatus === "loading" || accountsStatus === "idle") {
      return;
    }
    const storedView = localStorage.getItem(storageKeys.view) || "home";
    const storedAccountId = localStorage.getItem(storageKeys.accountId);
    if (storedView === "account-images" && storedAccountId) {
      const storedAccount = accounts.find(
        (account) => account.id === storedAccountId
      );
      if (storedAccount) {
        setSelectedAccount(storedAccount);
        setCursorStack([]);
        setCurrentCursor(null);
        setNextCursor(null);
        setAccountImages([]);
        setView("account-images");
        loadImages({ accountId: storedAccount.id });
        hasRestoredView.current = true;
        return;
      }
    }
    if (storedView === "cloudinary") {
      setView("cloudinary");
    } else if (storedView === "reels") {
      setView("reels");
      loadReels();
    } else {
      setView("home");
    }
    hasRestoredView.current = true;
  }, [accounts, accountsStatus, isAuthenticated]);

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setStatus("guest");
      setAccounts([]);
      setView("home");
      localStorage.removeItem(storageKeys.view);
      localStorage.removeItem(storageKeys.accountId);
    } catch (err) {
      console.error(err);
      setError("No se pudo cerrar sesión.");
    }
  };

  const currentPage = useMemo(
    () => cursorStack.length + 1,
    [cursorStack.length]
  );

  const filteredImages = useMemo(() => {
    if (imageFilter === "reels") {
      return accountImages.filter((image) => image.isReel);
    }
    if (imageFilter === "no-reels") {
      return accountImages.filter((image) => !image.isReel);
    }
    return accountImages;
  }, [accountImages, imageFilter]);

  const handleSelectAccount = (account) => {
    setSelectedAccount(account);
    setCursorStack([]);
    setCurrentCursor(null);
    setNextCursor(null);
    setAccountImages([]);
    setImageFilter("all");
    setView("account-images");
    loadImages({ accountId: account.id });
  };

  const handleNextPage = () => {
    if (!nextCursor || !selectedAccount) return;
    setCursorStack((prev) => [...prev, currentCursor]);
    loadImages({ accountId: selectedAccount.id, cursor: nextCursor });
  };

  const handlePreviousPage = () => {
    if (!selectedAccount || cursorStack.length === 0) return;
    const updatedStack = cursorStack.slice(0, -1);
    const cursor = updatedStack[updatedStack.length - 1];
    setCursorStack(updatedStack);
    loadImages({ accountId: selectedAccount.id, cursor });
  };

  const handleRefreshImages = () => {
    if (!selectedAccount) return;
    loadImages({ accountId: selectedAccount.id, cursor: currentCursor });
  };

  const handleGenerateReel = async () => {
    if (!selectedAccount) return;
    const count = Number(reelCount);
    const secondsPerImage = Number(reelSecondsPerImage);
    const zoomAmount = Number(reelZoomAmount);
    if (!Number.isFinite(count) || count <= 0) {
      setReelCreateError("Ingresa un número válido de imágenes.");
      return;
    }
    if (!Number.isFinite(secondsPerImage) || secondsPerImage <= 0) {
      setReelCreateError("Ingresa segundos válidos por imagen.");
      return;
    }
    if (!Number.isFinite(zoomAmount) || zoomAmount <= 0) {
      setReelCreateError("Ingresa una velocidad de zoom válida.");
      return;
    }

    try {
      setReelCreateStatus("loading");
      setReelCreateError("");
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/reels`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ count, secondsPerImage, zoomAmount }),
        }
      );

      if (handleUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          payload = null;
        }

        if (response.status === 409) {
          throw new Error(
            `No hay suficientes imágenes sin tag reel. Disponibles: ${payload?.available ?? 0}.`
          );
        }

        if (response.status === 400) {
          const messageByError = {
            "cloudinary-credentials-missing":
              "Faltan las credenciales de Cloudinary para esta cuenta.",
            "invalid-count": "Ingresa un número válido de imágenes.",
            "invalid-account": "La cuenta seleccionada no es válida.",
            "invalid-duration": "Ingresa segundos válidos por imagen.",
            "invalid-zoom": "Ingresa una velocidad de zoom válida.",
          };
          throw new Error(
            messageByError[payload?.error] || "No se pudo generar el reel."
          );
        }

        throw new Error("No se pudo generar el reel.");
      }

      const payload = await response.json();
      setAccountImages((prev) =>
        prev.map((image) =>
          payload.images.some((item) => item.publicId === image.publicId)
            ? {
                ...image,
                isReel: true,
                tags: Array.from(new Set([...(image.tags || []), "reel"])),
              }
            : image
        )
      );
      setReels((prev) => [payload.reel, ...prev]);
      setReelCreateStatus("success");
    } catch (err) {
      console.error(err);
      setReelCreateError(err.message || "No se pudo generar el reel.");
      setReelCreateStatus("error");
    } finally {
      setReelCreateStatus("idle");
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
      const requestPayload = {
        name: draft.name,
        cloudName: draft.cloudName,
        apiKey: draft.apiKey,
        ...(draft.apiSecret ? { apiSecret: draft.apiSecret } : {}),
      };
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (handleUnauthorized(response)) {
        return;
      }

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
      apiSecret: "",
    });
    setEditingId(account.id);
  };

  const handleDelete = async (accountId) => {
    try {
      const response = await fetch(`${backendUrl}/api/accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (handleUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudo eliminar la cuenta.");
      }

      setAccounts((prev) => prev.filter((account) => account.id !== accountId));
    } catch (err) {
      console.error(err);
      setError("No se pudo eliminar la cuenta.");
    }
  };

  const handleToggleReel = async (image) => {
    if (!selectedAccount) return;
    const nextEnabled = !image.isReel;
    setReelUpdating((prev) => ({ ...prev, [image.id]: true }));
    setImagesError("");
    try {
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/images/${encodeURIComponent(
          image.publicId
        )}/reel`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled: nextEnabled, type: image.type }),
        }
      );

      if (handleUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        throw new Error("update-failed");
      }

      setAccountImages((prev) =>
        prev.map((item) =>
          item.id === image.id
            ? {
                ...item,
                isReel: nextEnabled,
                tags: nextEnabled
                  ? Array.from(new Set([...(item.tags || []), "reel"]))
                  : (item.tags || []).filter((tag) => tag !== "reel"),
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      setImagesError("No se pudo actualizar la etiqueta Reel.");
    } finally {
      setReelUpdating((prev) => {
        const next = { ...prev };
        delete next[image.id];
        return next;
      });
    }
  };

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
            <>
              <button
                className="secondary"
                onClick={() => {
                  setView("reels");
                  loadReels();
                }}
              >
                Ver reels
              </button>
              <button className="secondary" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </header>

      {loginError && <p className="error">{loginError}</p>}
      {error && <p className="error">{error}</p>}

      {view === "home" && (
        <main className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Cuentas Cloudinary</p>
            <h1>ClipPilot</h1>
            <p className="subtitle">
              Gestiona tus cuentas de Cloudinary y mantén tus credenciales seguras.
            </p>
            {isAuthenticated && (
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setView("reels");
                  loadReels();
                }}
              >
                Ver reels creados
              </button>
            )}
          </div>
          {accounts.length === 0 ? (
            <div className="empty-state">
              <h2>Configura tus cuentas</h2>
              <p>
                Haz clic en tu usuario para agregar, editar o eliminar cuentas de
                Cloudinary.
              </p>
            </div>
          ) : (
            <section className="card">
              <header className="list-header">
                <div>
                  <h2>Conexiones disponibles</h2>
                  <p className="subtitle">
                    Selecciona una cuenta para revisar todas las imágenes.
                  </p>
                </div>
                <button className="secondary" onClick={() => setView("cloudinary")}>
                  Gestionar cuentas
                </button>
              </header>
              <div className="account-list">
                {accounts.map((account) => (
                  <button
                    className="account-row"
                    key={account.id}
                    onClick={() => handleSelectAccount(account)}
                  >
                    <div>
                      <h3>{account.name}</h3>
                      <p>Cloud name: {account.cloudName}</p>
                    </div>
                    <div className="account-row-actions">
                      <span className="pill pill--count">
                        {typeof imageCounts[account.id] === "number"
                          ? `${imageCounts[account.id]} ${
                              imageCounts[account.id] === 1 ? "imagen" : "imágenes"
                            }`
                          : imageCountsStatus === "loading"
                          ? "Cargando..."
                          : "Sin datos"}
                      </span>
                      <span className="pill">Ver imágenes</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {view === "cloudinary" && (
        <main className="cloudinary">
          <header className="cloudinary-header">
            <div>
              <p className="eyebrow">Gestión de Cloudinary</p>
              <h1>Conecta tus cuentas</h1>
              <p className="subtitle">
                Guarda varias cuentas y mantén tus credenciales a la mano.
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
                    placeholder={
                      editingId ? "Deja vacío para mantener el secreto actual" : "••••••••"
                    }
                  />
                </label>
              </div>
              {editingId && (
                <p className="muted">
                  El secreto actual está guardado. Solo escribe uno nuevo si deseas
                  reemplazarlo.
                </p>
              )}
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
                      <p>API Key: {account.apiKey}</p>
                      <p>
                        API Secret:{" "}
                        {account.apiSecretConfigured ? "Guardado" : "Pendiente"}
                      </p>
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
                </article>
              ))
            ) : (
              <div className="empty-state">
                <h2>Sin cuentas registradas</h2>
                <p>
                  Crea una cuenta para empezar a gestionar tus credenciales en ClipPilot.
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      {view === "account-images" && selectedAccount && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Cuenta Cloudinary</p>
              <h1>{selectedAccount.name}</h1>
              <p className="subtitle">
                Cloud name: {selectedAccount.cloudName}
              </p>
            </div>
            <button className="secondary" onClick={() => setView("home")}>
              Volver a conexiones
            </button>
          </header>

          <section className="card reel-generator">
            <header className="list-header">
              <div>
                <h2>Generar reel</h2>
                <p className="subtitle">
                  Seleccionaremos imágenes aleatorias sin tag reel y crearemos un
                  video con zoom alternado.
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setView("reels");
                  loadReels();
                }}
              >
                Ver reels creados
              </button>
            </header>
            <div className="reel-generator-controls">
              <label>
                Cantidad de imágenes
                <input
                  type="number"
                  min="1"
                  value={reelCount}
                  onChange={(event) => setReelCount(event.target.value)}
                />
              </label>
              <label>
                Segundos por imagen
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={reelSecondsPerImage}
                  onChange={(event) => setReelSecondsPerImage(event.target.value)}
                />
              </label>
              <label>
                Velocidad de zoom
                <input
                  type="number"
                  min="0.01"
                  max="0.3"
                  step="0.01"
                  value={reelZoomAmount}
                  onChange={(event) => setReelZoomAmount(event.target.value)}
                />
                <span className="hint">0.05 es un zoom lento recomendado.</span>
              </label>
              <button
                className="primary"
                type="button"
                onClick={handleGenerateReel}
                disabled={reelCreateStatus === "loading"}
              >
                {reelCreateStatus === "loading" ? "Generando..." : "Generar reel"}
              </button>
            </div>
            {reelCreateError && <p className="error">{reelCreateError}</p>}
          </section>

          <section className="card">
            <header className="list-header">
              <div>
                <h2>Imágenes disponibles</h2>
                <p className="subtitle">
                  Página {currentPage}. Mostramos 50 imágenes por bloque.
                </p>
              </div>
              <div className="filter-tabs" role="tablist" aria-label="Filtrar imágenes">
                <button
                  className={`secondary small${imageFilter === "all" ? " active" : ""}`}
                  type="button"
                  onClick={() => setImageFilter("all")}
                  role="tab"
                  aria-selected={imageFilter === "all"}
                >
                  Todas
                </button>
                <button
                  className={`secondary small${imageFilter === "reels" ? " active" : ""}`}
                  type="button"
                  onClick={() => setImageFilter("reels")}
                  role="tab"
                  aria-selected={imageFilter === "reels"}
                >
                  Reels
                </button>
                <button
                  className={`secondary small${imageFilter === "no-reels" ? " active" : ""}`}
                  type="button"
                  onClick={() => setImageFilter("no-reels")}
                  role="tab"
                  aria-selected={imageFilter === "no-reels"}
                >
                  No Reels
                </button>
              </div>
              <div className="pagination">
                <button
                  className="secondary"
                  onClick={handlePreviousPage}
                  disabled={cursorStack.length === 0 || imagesStatus === "loading"}
                >
                  Atrás
                </button>
                <button
                  className="secondary"
                  onClick={handleRefreshImages}
                  disabled={imagesStatus === "loading"}
                >
                  Refrescar
                </button>
                <button
                  className="secondary"
                  onClick={handleNextPage}
                  disabled={!nextCursor || imagesStatus === "loading"}
                >
                  Siguiente
                </button>
              </div>
            </header>

            {imagesError && <p className="error">{imagesError}</p>}
            {imagesStatus === "loading" && (
              <p className="muted">Cargando imágenes...</p>
            )}
            {filteredImages.length > 0 ? (
              <div className="image-grid image-grid--large">
                {filteredImages.map((image) => (
                  <div className="image-card" key={image.id}>
                    <div
                      className="image-thumb"
                      role="button"
                      tabIndex={0}
                      onClick={() => setLightboxImage(image)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setLightboxImage(image);
                        }
                      }}
                    >
                      <img src={image.secureUrl || image.url} alt={image.publicId} />
                      <span className="image-url">
                        {image.secureUrl || image.url}
                      </span>
                    </div>
                    <div className="image-actions">
                      <button
                        className={`secondary small reel-toggle${
                          image.isReel ? " active" : ""
                        }`}
                        type="button"
                        onClick={() => handleToggleReel(image)}
                        disabled={reelUpdating[image.id]}
                      >
                        {image.isReel ? "Reel activo" : "Reel"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">
                {accountImages.length > 0
                  ? "No hay imágenes en este filtro."
                  : "No se encontraron imágenes para esta cuenta."}
              </p>
            )}
          </section>
        </main>
      )}

      {view === "reels" && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Reels generados</p>
              <h1>Reels en Cloudinary</h1>
              <p className="subtitle">
                Revisa los reels creados con tus imágenes.
              </p>
            </div>
            <button className="secondary" onClick={() => setView("home")}>
              Volver a inicio
            </button>
          </header>

          <section className="card">
            <header className="list-header">
              <div>
                <h2>Listado de reels</h2>
                <p className="subtitle">
                  {reels.length
                    ? `${reels.length} reels disponibles`
                    : "Aún no hay reels creados."}
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={loadReels}
                disabled={reelsStatus === "loading"}
              >
                Refrescar
              </button>
            </header>
            {reelsError && <p className="error">{reelsError}</p>}
            {reelsStatus === "loading" && <p className="muted">Cargando reels...</p>}
            {reels.length > 0 ? (
              <div className="reel-grid">
                {reels.map((reel) => (
                  <article className="reel-card" key={reel.id || reel.publicId}>
                    <video
                      src={reel.secureUrl || reel.url}
                      controls
                      preload="metadata"
                    />
                    <div className="reel-meta">
                      <p className="subtitle">
                        Cuenta: {reel.accountName || reel.accountId}
                      </p>
                      <p className="muted">
                        Imágenes: {reel.imageCount ?? "N/A"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              reelsStatus !== "loading" && (
                <p className="empty">No hay reels creados todavía.</p>
              )
            )}
          </section>
        </main>
      )}

      {lightboxImage && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-content">
            <button
              className="secondary small modal-close"
              onClick={() => setLightboxImage(null)}
            >
              Cerrar
            </button>
            <img
              src={lightboxImage.secureUrl || lightboxImage.url}
              alt={lightboxImage.publicId}
            />
            <p className="muted">{lightboxImage.publicId}</p>
          </div>
          <button
            className="modal-backdrop"
            onClick={() => setLightboxImage(null)}
            aria-label="Cerrar vista previa"
          />
        </div>
      )}
    </div>
  );
}
