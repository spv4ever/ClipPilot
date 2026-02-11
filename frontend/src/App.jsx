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
  const [imagePageSize, setImagePageSize] = useState(50);
  const [imageCounts, setImageCounts] = useState({});
  const [imageCountsStatus, setImageCountsStatus] = useState("idle");
  const [reelImageStats, setReelImageStats] = useState(null);
  const [reelImageStatsStatus, setReelImageStatsStatus] = useState("idle");
  const [reelImageStatsError, setReelImageStatsError] = useState("");
  const [reelUpdating, setReelUpdating] = useState({});
  const [finalUpdating, setFinalUpdating] = useState({});
  const [selectedReelImages, setSelectedReelImages] = useState([]);
  const [reelSelectionMode, setReelSelectionMode] = useState("manual");
  const [reelRandomCount, setReelRandomCount] = useState(6);
  const [reelSecondsPerImage, setReelSecondsPerImage] = useState(2);
  const [reelZoomAmount, setReelZoomAmount] = useState(0.05);
  const [reelFadeOutToBlack, setReelFadeOutToBlack] = useState(true);
  const [reelCopyEnabled, setReelCopyEnabled] = useState(false);
  const [reelCopyStatus, setReelCopyStatus] = useState("idle");
  const [reelCopyError, setReelCopyError] = useState("");
  const [reelCreateStatus, setReelCreateStatus] = useState("idle");
  const [reelCreateError, setReelCreateError] = useState("");
  const [reels, setReels] = useState([]);
  const [reelPreviewEnabled, setReelPreviewEnabled] = useState({});
  const [reelsStatus, setReelsStatus] = useState("idle");
  const [reelsError, setReelsError] = useState("");
  const [videos, setVideos] = useState([]);
  const [videosStatus, setVideosStatus] = useState("idle");
  const [videosError, setVideosError] = useState("");
  const [copyIdea, setCopyIdea] = useState("");
  const [copyObjective, setCopyObjective] = useState("");
  const [copyAudience, setCopyAudience] = useState("");
  const [copyKeyPoints, setCopyKeyPoints] = useState("");
  const [copyTone, setCopyTone] = useState("cercano");
  const [copyCta, setCopyCta] = useState("");
  const [copyHashtags, setCopyHashtags] = useState("");
  const [copyOutput, setCopyOutput] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copyCopied, setCopyCopied] = useState(false);
  const [videoSourceImage, setVideoSourceImage] = useState(null);
  const [videoPositivePrompt, setVideoPositivePrompt] = useState("animate image");
  const [videoNegativePrompt, setVideoNegativePrompt] = useState(
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
  );
  const [videoFrameLength, setVideoFrameLength] = useState(81);
  const [videoFps, setVideoFps] = useState(32);
  const [videoAspectRatio, setVideoAspectRatio] = useState("9:16");
  const [videoGenerationStatus, setVideoGenerationStatus] = useState("idle");
  const [videoGenerationError, setVideoGenerationError] = useState("");
  const [videoPromptSuggestStatus, setVideoPromptSuggestStatus] = useState("idle");
  const [videoPromptSuggestError, setVideoPromptSuggestError] = useState("");
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const hasRestoredView = useRef(false);
  const videoGenerationInFlightRef = useRef(false);

  const displayName = useMemo(() => user?.displayName || "", [user]);
  const userRole = useMemo(() => user?.role || "free", [user]);
  const selectedReelIds = useMemo(
    () => new Set(selectedReelImages.map((image) => image.publicId)),
    [selectedReelImages]
  );
  const formatCount = (value) =>
    Number.isFinite(value) ? value.toLocaleString("es-ES") : "N/D";

  const getReelKey = (reel) => reel.id || reel.publicId;

  const isReelPreviewVisible = (reel) => {
    const reelKey = getReelKey(reel);
    if (!reelKey) {
      return true;
    }
    return reelPreviewEnabled[reelKey] ?? true;
  };

  const handleToggleReelPreview = (reel) => {
    const reelKey = getReelKey(reel);
    if (!reelKey) {
      return;
    }
    setReelPreviewEnabled((previous) => ({
      ...previous,
      [reelKey]: !(previous[reelKey] ?? true),
    }));
  };

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

  const fetchImagesPage = async ({ accountId, cursor, limit }) => {
    const url = new URL(`${backendUrl}/api/accounts/${accountId}/images`);
    url.searchParams.set("limit", limit.toString());
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const response = await fetch(url.toString(), {
      credentials: "include",
    });

    if (handleUnauthorized(response)) {
      return { unauthorized: true };
    }

    if (!response.ok) {
      throw new Error("No se pudieron cargar las imágenes.");
    }

    const payload = await response.json();
    return { images: payload.images || [], nextCursor: payload.nextCursor || null };
  };

  const loadImages = async ({
    accountId,
    cursor,
    filter = imageFilter,
    limit = imagePageSize,
    allowSkipEmpty = false,
    baseStack,
  } = {}) => {
    if (!accountId) {
      setAccountImages([]);
      return;
    }

    try {
      setImagesStatus("loading");
      setImagesError("");
      let currentCursorValue = cursor || null;
      let stack = baseStack ?? cursorStack;
      const shouldUpdateStack = baseStack !== undefined || allowSkipEmpty;
      const shouldFilter = filter !== "all";
      const matchesFilter = (image) =>
        filter === "reels" ? image.isReel : !image.isReel;
      let collectedImages = [];
      let nextCursor = null;
      let pageStartCursor = currentCursorValue;
      let foundMatchPage = !shouldFilter;
      const shouldSkipEmpty = allowSkipEmpty && shouldFilter;

      while (true) {
        const result = await fetchImagesPage({
          accountId,
          cursor: currentCursorValue,
          limit,
        });
        if (result.unauthorized) {
          setAccountImages([]);
          return;
        }

        const pageImages = result.images;
        nextCursor = result.nextCursor;

        if (!shouldFilter) {
          collectedImages = pageImages;
          pageStartCursor = currentCursorValue;
          break;
        }

        const pageMatches = pageImages.filter(matchesFilter);
        if (pageMatches.length === 0 && shouldSkipEmpty && nextCursor) {
          stack = [...stack, currentCursorValue];
          currentCursorValue = nextCursor;
          continue;
        }

        if (!foundMatchPage) {
          pageStartCursor = currentCursorValue;
          foundMatchPage = true;
        }

        if (pageMatches.length > 0) {
          collectedImages = [...collectedImages, ...pageMatches].slice(0, limit);
        }

        if (collectedImages.length >= limit || !nextCursor) {
          break;
        }

        currentCursorValue = nextCursor;
      }

      setAccountImages(collectedImages);
      setNextCursor(nextCursor || null);
      setCurrentCursor(pageStartCursor);
      if (shouldUpdateStack) {
        setCursorStack(stack);
      }
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

  const loadReelImageStats = async (accountId) => {
    if (!accountId) {
      setReelImageStats(null);
      return;
    }

    try {
      setReelImageStatsStatus("loading");
      setReelImageStatsError("");
      const response = await fetch(
        `${backendUrl}/api/accounts/${accountId}/reels/summary`,
        {
          credentials: "include",
        }
      );

      if (handleUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        throw new Error("stats-failed");
      }

      const payload = await response.json();
      setReelImageStats({
        totalCount: payload.totalCount ?? null,
        reelCount: payload.reelCount ?? null,
        availableCount: payload.availableCount ?? null,
      });
      setReelImageStatsStatus("success");
    } catch (err) {
      console.error(err);
      setReelImageStatsError("No se pudo cargar el recuento de imágenes.");
      setReelImageStatsStatus("error");
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

  const loadVideos = async () => {
    try {
      setVideosStatus("loading");
      setVideosError("");
      const response = await fetch(`${backendUrl}/api/videos`, {
        credentials: "include",
      });

      if (handleUnauthorized(response)) {
        setVideos([]);
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar los videos.");
      }

      const payload = await response.json();
      setVideos(payload.videos || []);
      setVideosStatus("success");
    } catch (err) {
      console.error(err);
      setVideosError("No se pudieron cargar los videos.");
      setVideosStatus("error");
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
    } else if (storedView === "videos-overview") {
      setView("videos-overview");
      loadVideos();
    } else {
      setView("home");
    }
    hasRestoredView.current = true;
  }, [accounts, accountsStatus, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selectedAccount?.id) {
      setReelImageStats(null);
      return;
    }
    loadReelImageStats(selectedAccount.id);
  }, [isAuthenticated, selectedAccount?.id]);

  useEffect(() => {
    if (!selectedReelImages.length) {
      return;
    }
    setSelectedReelImages((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const updated = accountImages.find(
          (image) => image.publicId === item.publicId
        );
        if (!updated) {
          return item;
        }
        if (updated.isFinal !== item.isFinal) {
          changed = true;
          return { ...item, isFinal: updated.isFinal };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [accountImages, selectedReelImages.length]);

  const handleToggleReelSelection = (image) => {
    if (reelSelectionMode === "random") {
      return;
    }
    setSelectedReelImages((prev) => {
      const exists = prev.some((item) => item.publicId === image.publicId);
      if (exists) {
        return prev.filter((item) => item.publicId !== image.publicId);
      }
      return [
        ...prev,
        {
          publicId: image.publicId,
          secureUrl: image.secureUrl,
          url: image.url,
          isFinal: image.isFinal,
        },
      ];
    });
  };

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
    setImagePageSize(50);
    setSelectedReelImages([]);
    setVideoSourceImage(null);
    setGeneratedVideo(null);
    setVideoGenerationError("");
    setView("account-images");
    loadImages({ accountId: account.id, limit: 50, filter: "all", baseStack: [] });
    loadReelImageStats(account.id);
  };

  const handleOpenVideosOverview = () => {
    setView("videos-overview");
    loadVideos();
  };

  const handleImageFilterChange = (nextFilter) => {
    setImageFilter(nextFilter);
    if (!selectedAccount) return;
    setCursorStack([]);
    setCurrentCursor(null);
    setNextCursor(null);
    loadImages({
      accountId: selectedAccount.id,
      filter: nextFilter,
      allowSkipEmpty: nextFilter !== "all",
      baseStack: [],
    });
  };

  const handlePageSizeChange = (event) => {
    const nextSize = Number(event.target.value);
    setImagePageSize(nextSize);
    if (!selectedAccount) return;
    setCursorStack([]);
    setCurrentCursor(null);
    setNextCursor(null);
    loadImages({
      accountId: selectedAccount.id,
      limit: nextSize,
      filter: imageFilter,
      allowSkipEmpty: imageFilter !== "all",
      baseStack: [],
    });
  };

  const handleNextPage = () => {
    if (!nextCursor || !selectedAccount) return;
    setCursorStack((prev) => [...prev, currentCursor]);
    loadImages({
      accountId: selectedAccount.id,
      cursor: nextCursor,
      filter: imageFilter,
      limit: imagePageSize,
      allowSkipEmpty: imageFilter !== "all",
    });
  };

  const handlePreviousPage = () => {
    if (!selectedAccount || cursorStack.length === 0) return;
    const updatedStack = cursorStack.slice(0, -1);
    const cursor = updatedStack[updatedStack.length - 1];
    setCursorStack(updatedStack);
    loadImages({
      accountId: selectedAccount.id,
      cursor,
      filter: imageFilter,
      limit: imagePageSize,
      allowSkipEmpty: imageFilter !== "all",
      baseStack: updatedStack,
    });
  };

  const handleRefreshImages = () => {
    if (!selectedAccount) return;
    loadImages({
      accountId: selectedAccount.id,
      cursor: currentCursor,
      filter: imageFilter,
      limit: imagePageSize,
      allowSkipEmpty: imageFilter !== "all",
    });
  };

  const handleFirstPage = () => {
    if (!selectedAccount) return;
    setCursorStack([]);
    loadImages({
      accountId: selectedAccount.id,
      filter: imageFilter,
      limit: imagePageSize,
      allowSkipEmpty: imageFilter !== "all",
      baseStack: [],
    });
  };

  const handleLastPage = async () => {
    if (!selectedAccount || !nextCursor) return;
    try {
      setImagesStatus("loading");
      setImagesError("");
      let stack = [...cursorStack];
      let activeCursor = currentCursor;
      let next = nextCursor;
      let images = accountImages;
      while (next) {
        stack = [...stack, activeCursor];
        const result = await fetchImagesPage({
          accountId: selectedAccount.id,
          cursor: next,
          limit: imagePageSize,
        });
        if (result.unauthorized) {
          setAccountImages([]);
          return;
        }
        images = result.images;
        activeCursor = next;
        next = result.nextCursor || null;
      }
      setAccountImages(images);
      setCursorStack(stack);
      setCurrentCursor(activeCursor);
      setNextCursor(next);
      setImagesStatus("success");
    } catch (err) {
      console.error(err);
      setImagesError("No se pudieron cargar las imágenes.");
      setImagesStatus("error");
    }
  };

  const handleGenerateReel = async () => {
    if (!selectedAccount) return;
    const secondsPerImage = Number(reelSecondsPerImage);
    const zoomAmount = Number(reelZoomAmount);
    const randomCount = Number(reelRandomCount);
    const isRandomSelection = reelSelectionMode === "random";
    if (!isRandomSelection && !selectedReelImages.length) {
      setReelCreateError("Selecciona las imágenes que quieres usar.");
      return;
    }
    if (isRandomSelection && (!Number.isFinite(randomCount) || randomCount <= 0)) {
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
      setReelCopyError("");
      setReelCopyStatus(reelCopyEnabled ? "loading" : "idle");
      const manualImageIds = selectedReelImages.map((image) => image.publicId);
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/reels`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(isRandomSelection
              ? { count: randomCount }
              : { imagePublicIds: manualImageIds }),
            secondsPerImage,
            zoomAmount,
            fadeOutToBlack: reelFadeOutToBlack,
            generateCopy: reelCopyEnabled,
          }),
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
          if (payload?.error === "no-final-image") {
            throw new Error(
              "No hay imágenes con la tag final disponibles para cerrar el reel."
            );
          }
          if (payload?.error === "final-not-last") {
            throw new Error(
              "La última imagen debe tener la etiqueta Final para cerrar el reel."
            );
          }
          throw new Error(
            `No hay suficientes imágenes sin tag reel. Disponibles: ${payload?.available ?? 0}.`
          );
        }

        if (response.status === 400) {
          const messageByError = {
            "cloudinary-credentials-missing":
              "Faltan las credenciales de Cloudinary para esta cuenta.",
            "invalid-count": "Ingresa un número válido de imágenes.",
            "invalid-selection": "Selecciona imágenes válidas para el reel.",
            "duplicate-images": "No repitas imágenes en la selección.",
            "invalid-account": "La cuenta seleccionada no es válida.",
            "invalid-duration": "Ingresa segundos válidos por imagen.",
            "invalid-zoom": "Ingresa una velocidad de zoom válida.",
          };
          throw new Error(
            messageByError[payload?.error] || "No se pudo generar el reel."
          );
        }

        if (response.status === 404 && payload?.error === "image-not-found") {
          throw new Error("Una de las imágenes seleccionadas no existe.");
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
      if (payload.copy?.text) {
        setCopyOutput(payload.copy.text);
        setCopyError("");
        setCopyCopied(false);
      }
      if (payload.copyError) {
        const messageByError = {
          "copy-image-unavailable":
            "No se pudo usar la segunda imagen para generar el copy.",
          "openai-api-key-missing":
            "Falta configurar la API Key de OpenAI para generar el copy.",
          "copy-generation-failed": "No se pudo generar el copy con IA.",
        };
        setReelCopyError(
          messageByError[payload.copyError] || "No se pudo generar el copy."
        );
        setReelCopyStatus("error");
      } else if (reelCopyEnabled) {
        setReelCopyStatus(payload.copy?.text ? "success" : "idle");
      } else {
        setReelCopyStatus("idle");
      }
      setSelectedReelImages([]);
      setReelCreateStatus("success");
    } catch (err) {
      console.error(err);
      setReelCreateError(err.message || "No se pudo generar el reel.");
      setReelCreateStatus("error");
      if (reelCopyEnabled) {
        setReelCopyStatus("error");
        setReelCopyError("No se pudo generar el copy con IA.");
      }
    } finally {
      setReelCreateStatus("idle");
    }
  };

  const normalizeHashtags = (rawTags) =>
    rawTags
      .split(/,|\n/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#/, "")}`));

  const handleGenerateCopy = () => {
    if (!copyIdea.trim()) {
      setCopyError("Ingresa el tema o producto para generar el copy.");
      return;
    }

    const headline =
      copyTone === "enérgico"
        ? `¡${copyIdea.trim()}!`
        : copyTone === "formal"
          ? `${copyIdea.trim()}.`
          : copyIdea.trim();

    const bulletLines = copyKeyPoints
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `• ${line}`);

    const hashtags = normalizeHashtags(copyHashtags);
    const parts = [headline];

    if (copyObjective.trim()) {
      parts.push(copyObjective.trim());
    }

    if (bulletLines.length > 0) {
      parts.push(bulletLines.join("\n"));
    }

    if (copyAudience.trim()) {
      parts.push(`👥 ${copyAudience.trim()}`);
    }

    if (copyCta.trim()) {
      parts.push(copyCta.trim());
    }

    if (hashtags.length > 0) {
      parts.push(hashtags.join(" "));
    }

    setCopyOutput(parts.join("\n\n"));
    setCopyError("");
    setCopyCopied(false);
  };

  const handleCopyToClipboard = async () => {
    if (!copyOutput) return;
    try {
      await navigator.clipboard.writeText(copyOutput);
      setCopyCopied(true);
      setTimeout(() => setCopyCopied(false), 2000);
    } catch (err) {
      console.error(err);
      setCopyError("No se pudo copiar el texto. Selecciónalo manualmente.");
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
      loadReelImageStats(selectedAccount.id);
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

  const handleToggleFinal = async (image) => {
    if (!selectedAccount) return;
    const nextEnabled = !image.isFinal;
    setFinalUpdating((prev) => ({ ...prev, [image.id]: true }));
    setImagesError("");
    try {
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/images/${encodeURIComponent(
          image.publicId
        )}/final`,
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
                isFinal: nextEnabled,
                tags: nextEnabled
                  ? Array.from(new Set([...(item.tags || []), "final"]))
                  : (item.tags || []).filter((tag) => tag !== "final"),
              }
            : item
        )
      );
      setSelectedReelImages((prev) =>
        prev.map((item) =>
          item.publicId === image.publicId
            ? { ...item, isFinal: nextEnabled }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      setImagesError("No se pudo actualizar la etiqueta Final.");
    } finally {
      setFinalUpdating((prev) => {
        const next = { ...prev };
        delete next[image.id];
        return next;
      });
    }
  };

  const handleOpenVideoWorkflow = (image) => {
    setVideoSourceImage(image);
    setGeneratedVideo(null);
    setVideoGenerationError("");
    setVideoPromptSuggestError("");
    setView("video-workflow");
    loadVideos();
  };

  const handleSuggestVideoPrompt = async () => {
    if (!selectedAccount || !videoSourceImage) {
      setVideoPromptSuggestError("Selecciona una imagen para pedir el prompt.");
      return;
    }

    try {
      setVideoPromptSuggestStatus("loading");
      setVideoPromptSuggestError("");
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/videos/suggest-prompt`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrl: videoSourceImage.secureUrl || videoSourceImage.url,
            currentPrompt: videoPositivePrompt,
          }),
        }
      );

      if (handleUnauthorized(response)) {
        return;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const messageByError = {
          "invalid-image-url": "La imagen seleccionada no tiene una URL válida.",
          "invalid-account": "La cuenta seleccionada no es válida.",
          "account-not-found": "No se encontró la cuenta seleccionada.",
          "openai-api-key-missing": "Falta configurar la API key de OpenAI en el backend.",
          "openai-request-failed": "OpenAI no respondió correctamente. Inténtalo de nuevo.",
          "openai-empty-response": "OpenAI no devolvió un prompt utilizable.",
          "openai-invalid-json": "OpenAI devolvió un formato inesperado.",
        };
        throw new Error(
          messageByError[payload?.error] || "No se pudo sugerir el prompt con IA."
        );
      }

      if (!payload?.prompt) {
        throw new Error("OpenAI no devolvió un prompt.");
      }

      setVideoPositivePrompt(payload.prompt);
    } catch (error) {
      console.error(error);
      setVideoPromptSuggestError(
        error.message || "No se pudo sugerir el prompt con IA."
      );
    } finally {
      setVideoPromptSuggestStatus("idle");
    }
  };

  const handleGenerateVideo = async () => {
    if (!selectedAccount || !videoSourceImage) {
      setVideoGenerationError("Selecciona una imagen para iniciar el workflow.");
      return;
    }

    if (videoGenerationInFlightRef.current) {
      return;
    }

    const parsedLength = Number(videoFrameLength);
    const parsedFps = Number(videoFps);
    if (!Number.isFinite(parsedLength) || parsedLength < 8 || parsedLength > 240) {
      setVideoGenerationError("La duración en frames debe estar entre 8 y 240.");
      return;
    }
    if (!Number.isFinite(parsedFps) || parsedFps < 8 || parsedFps > 60) {
      setVideoGenerationError("Los FPS deben estar entre 8 y 60.");
      return;
    }

    const validAspectRatios = new Set(["9:16", "3:4", "1:1", "4:3", "16:9"]);
    if (!validAspectRatios.has(videoAspectRatio)) {
      setVideoGenerationError("Selecciona una relación de aspecto válida.");
      return;
    }

    try {
      videoGenerationInFlightRef.current = true;
      setVideoGenerationStatus("loading");
      setVideoGenerationError("");
      const response = await fetch(
        `${backendUrl}/api/accounts/${selectedAccount.id}/videos/from-image`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrl: videoSourceImage.secureUrl || videoSourceImage.url,
            imagePublicId: videoSourceImage.publicId,
            positivePrompt: videoPositivePrompt,
            negativePrompt: videoNegativePrompt,
            frameLength: parsedLength,
            fps: parsedFps,
            aspectRatio: videoAspectRatio,
          }),
        }
      );

      if (handleUnauthorized(response)) {
        return;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const messageByError = {
          "invalid-image-url": "Falta la URL de imagen para ComfyUI.",
          "invalid-frame-length": "Duración inválida. Usa entre 8 y 240 frames.",
          "invalid-fps": "FPS inválidos. Usa entre 8 y 60.",
          "invalid-aspect-ratio": "Selecciona un aspect ratio válido (9:16, 3:4, 1:1, 4:3, 16:9).",
          "video-generation-in-progress": "Ya hay una generación en curso para esta imagen.",
          "cloudinary-credentials-missing": "Faltan credenciales de Cloudinary en la cuenta.",
          "comfyui-output-file-not-found": "ComfyUI terminó, pero no se encontró el archivo en la carpeta output.",
          "comfyui-timeout": "ComfyUI tardó demasiado en generar el video.",
        };
        throw new Error(messageByError[payload?.error] || "No se pudo generar el video.");
      }

      setGeneratedVideo(payload?.video || null);
      loadVideos();
    } catch (error) {
      console.error(error);
      setVideoGenerationError(error.message || "No se pudo generar el video.");
    } finally {
      videoGenerationInFlightRef.current = false;
      setVideoGenerationStatus("idle");
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
              <button className="secondary" onClick={handleOpenVideosOverview}>
                Ver videos
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
              <div className="header-actions">
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
                <button className="secondary" type="button" onClick={handleOpenVideosOverview}>
                  Ver todos los videos
                </button>
              </div>
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
            <div className="header-actions">
              <button className="secondary" onClick={() => setView("home")}>
                Volver a conexiones
              </button>
              <button className="secondary" onClick={handleOpenVideosOverview}>
                Ver videos
              </button>
            </div>
          </header>

          <section className="card reel-generator">
            <header className="list-header">
              <div>
                <h2>Generar reel</h2>
                <p className="subtitle">
                  Selecciona las imágenes que quieres usar y asegúrate de dejar
                  el cierre con una imagen final (también la usaremos al inicio).
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
              <div className="reel-selection-summary">
                <div>
                  <p className="subtitle">
                    {reelSelectionMode === "manual"
                      ? `Seleccionadas: ${selectedReelImages.length}`
                      : "Selección aleatoria activa"}
                  </p>
                  <p className="muted">
                    {reelSelectionMode === "manual"
                      ? "Añadiremos automáticamente una imagen Final aleatoria al inicio y para cerrar el reel."
                      : "Seleccionaremos imágenes aleatorias y usaremos la imagen final al inicio y al cierre."}
                  </p>
                  <div className="reel-stats">
                    {reelImageStatsStatus === "loading" && (
                      <p className="muted">Cargando recuento de imágenes...</p>
                    )}
                    {reelImageStatsStatus !== "loading" && (
                      <p className="muted">
                        Imágenes totales: {formatCount(reelImageStats?.totalCount)}{" "}
                        · Imágenes usadas en reels:{" "}
                        {formatCount(reelImageStats?.reelCount)} · Imágenes sin
                        usar en reels: {formatCount(reelImageStats?.availableCount)}
                      </p>
                    )}
                    {reelImageStatsError && (
                      <p className="error">{reelImageStatsError}</p>
                    )}
                  </div>
                </div>
                {reelSelectionMode === "manual" && selectedReelImages.length > 0 && (
                  <button
                    className="secondary small"
                    type="button"
                    onClick={() => setSelectedReelImages([])}
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
              <div
                className="filter-tabs reel-mode-tabs"
                role="tablist"
                aria-label="Modo de selección"
              >
                <button
                  className={`secondary small${
                    reelSelectionMode === "manual" ? " active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={reelSelectionMode === "manual"}
                  onClick={() => setReelSelectionMode("manual")}
                >
                  Selección manual
                </button>
                <button
                  className={`secondary small${
                    reelSelectionMode === "random" ? " active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={reelSelectionMode === "random"}
                  onClick={() => setReelSelectionMode("random")}
                >
                  Selección aleatoria
                </button>
              </div>
              {reelSelectionMode === "random" && (
                <label>
                  Número de imágenes
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={reelRandomCount}
                    onChange={(event) => setReelRandomCount(event.target.value)}
                  />
                </label>
              )}
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
                <span className="label-with-tooltip">
                  Velocidad de zoom
                  <span
                    className="tooltip"
                    data-tooltip="0.05 es un zoom lento recomendado."
                    aria-label="0.05 es un zoom lento recomendado."
                    role="img"
                  >
                    ℹ
                  </span>
                </span>
                <input
                  type="number"
                  min="0.01"
                  max="0.3"
                  step="0.01"
                  value={reelZoomAmount}
                  onChange={(event) => setReelZoomAmount(event.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reelFadeOutToBlack}
                  onChange={(event) => setReelFadeOutToBlack(event.target.checked)}
                />
                Final con fade out a negro
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reelCopyEnabled}
                  onChange={(event) => setReelCopyEnabled(event.target.checked)}
                />
                Generar copy con IA al crear el reel (usa la 2da imagen para el
                estilo)
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
            {reelCopyStatus === "loading" && (
              <p className="muted">Generando copy con IA...</p>
            )}
            {reelCopyStatus === "success" && (
              <p className="muted">Copy con IA listo en el generador.</p>
            )}
            {reelCopyError && <p className="error">{reelCopyError}</p>}
          </section>

          <section className="card copy-generator">
            <header className="list-header">
              <div>
                <h2>Generar copy + hashtags</h2>
                <p className="subtitle">
                  Completa los campos y obtén un texto listo para copiar y pegar en
                  redes sociales.
                </p>
              </div>
            </header>
            <div className="copy-generator-controls">
              <label>
                Tema, producto o campaña
                <input
                  type="text"
                  value={copyIdea}
                  onChange={(event) => setCopyIdea(event.target.value)}
                  placeholder="Ej: Lanzamiento de la colección Primavera"
                />
              </label>
              <label>
                Objetivo o mensaje principal
                <input
                  type="text"
                  value={copyObjective}
                  onChange={(event) => setCopyObjective(event.target.value)}
                  placeholder="Ej: Invitar a conocer los nuevos modelos"
                />
              </label>
              <label>
                Audiencia
                <input
                  type="text"
                  value={copyAudience}
                  onChange={(event) => setCopyAudience(event.target.value)}
                  placeholder="Ej: amantes de la moda en LATAM"
                />
              </label>
              <label>
                Puntos clave (uno por línea)
                <textarea
                  rows="4"
                  value={copyKeyPoints}
                  onChange={(event) => setCopyKeyPoints(event.target.value)}
                  placeholder="Ej: Colores vibrantes\nEnvío gratis\nStock limitado"
                />
              </label>
              <label>
                Tono
                <select
                  value={copyTone}
                  onChange={(event) => setCopyTone(event.target.value)}
                >
                  <option value="cercano">Cercano</option>
                  <option value="enérgico">Enérgico</option>
                  <option value="formal">Formal</option>
                </select>
              </label>
              <label>
                Llamado a la acción (CTA)
                <input
                  type="text"
                  value={copyCta}
                  onChange={(event) => setCopyCta(event.target.value)}
                  placeholder="Ej: Escribe por DM y reserva tu favorito."
                />
              </label>
              <label>
                Hashtags (separa con comas o saltos de línea)
                <textarea
                  rows="3"
                  value={copyHashtags}
                  onChange={(event) => setCopyHashtags(event.target.value)}
                  placeholder="#Moda #Primavera #Novedades"
                />
              </label>
              <div className="copy-actions">
                <button className="primary" type="button" onClick={handleGenerateCopy}>
                  Generar texto
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={handleCopyToClipboard}
                  disabled={!copyOutput}
                >
                  {copyCopied ? "¡Copiado!" : "Copiar texto"}
                </button>
              </div>
            </div>
            {copyError && <p className="error">{copyError}</p>}
            <div className="copy-output">
              <label>
                Texto generado
                <textarea
                  rows="8"
                  readOnly
                  value={copyOutput}
                  placeholder="Aquí verás el texto listo para publicar."
                />
              </label>
            </div>
          </section>

          <section className="card">
            <header className="list-header">
              <div>
                <h2>Imágenes disponibles</h2>
                <p className="subtitle">
                  Página {currentPage}. Mostramos {imagePageSize} imágenes por bloque.
                </p>
              </div>
              <div className="filter-tabs" role="tablist" aria-label="Filtrar imágenes">
                <button
                  className={`secondary small${imageFilter === "all" ? " active" : ""}`}
                  type="button"
                  onClick={() => handleImageFilterChange("all")}
                  role="tab"
                  aria-selected={imageFilter === "all"}
                >
                  Todas
                </button>
                <button
                  className={`secondary small${imageFilter === "reels" ? " active" : ""}`}
                  type="button"
                  onClick={() => handleImageFilterChange("reels")}
                  role="tab"
                  aria-selected={imageFilter === "reels"}
                >
                  Reels
                </button>
                <button
                  className={`secondary small${imageFilter === "no-reels" ? " active" : ""}`}
                  type="button"
                  onClick={() => handleImageFilterChange("no-reels")}
                  role="tab"
                  aria-selected={imageFilter === "no-reels"}
                >
                  No Reels
                </button>
              </div>
              <label className="small select-inline">
                <span>Tamaño de página</span>
                <select value={imagePageSize} onChange={handlePageSizeChange}>
                  {[20, 50, 100, 200].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pagination">
                <button
                  className="secondary"
                  onClick={handleFirstPage}
                  disabled={cursorStack.length === 0 || imagesStatus === "loading"}
                >
                  Inicio
                </button>
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
                <button
                  className="secondary"
                  onClick={handleLastPage}
                  disabled={!nextCursor || imagesStatus === "loading"}
                >
                  Fin
                </button>
              </div>
            </header>

            {imagesError && <p className="error">{imagesError}</p>}
            {imagesStatus === "loading" && (
              <p className="muted">Cargando imágenes...</p>
            )}
            {filteredImages.length > 0 ? (
              <div className="image-grid image-grid--large">
                {filteredImages.map((image) => {
                  const isSelected = selectedReelIds.has(image.publicId);
                  return (
                    <div
                      className={`image-card${isSelected ? " selected" : ""}`}
                      key={image.id}
                    >
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
                        <img
                          src={image.secureUrl || image.url}
                          alt={image.publicId}
                        />
                        <span className="image-url">
                          {image.secureUrl || image.url}
                        </span>
                      </div>
                      <div className="image-actions">
                        <button
                          className={`secondary small reel-select${
                            isSelected ? " active" : ""
                          }`}
                          type="button"
                          onClick={() => handleToggleReelSelection(image)}
                          disabled={reelSelectionMode === "random"}
                        >
                          {reelSelectionMode === "random"
                            ? "Selección aleatoria"
                            : isSelected
                              ? "Seleccionada"
                              : "Seleccionar"}
                        </button>
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
                        <button
                          className={`secondary small final-toggle${
                            image.isFinal ? " active" : ""
                          }`}
                          type="button"
                          onClick={() => handleToggleFinal(image)}
                          disabled={finalUpdating[image.id]}
                        >
                          {image.isFinal ? "Final activo" : "Final"}
                        </button>
                        <button
                          className="secondary small video-workflow-trigger"
                          type="button"
                          onClick={() => handleOpenVideoWorkflow(image)}
                          title="Generar video desde esta imagen"
                        >
                          🎬 Video
                        </button>
                      </div>
                    </div>
                  );
                })}
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

      {view === "video-workflow" && selectedAccount && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Workflow ComfyUI</p>
              <h1>Generar video desde imagen</h1>
              <p className="subtitle">
                Cuenta: {selectedAccount.name} · ComfyUI en localhost:8188
              </p>
            </div>
            <div className="header-actions">
              <button className="secondary" onClick={() => setView("account-images")}>
                Volver a imágenes
              </button>
            </div>
          </header>

          <section className="card video-workflow">
            {videoSourceImage ? (
              <div className="video-workflow-grid">
                <div className="video-workflow-preview reel-card">
                  <img
                    src={videoSourceImage.secureUrl || videoSourceImage.url}
                    alt={videoSourceImage.publicId}
                  />
                  <p className="muted">Origen: {videoSourceImage.publicId}</p>
                </div>
                <div className="video-workflow-form">
                  <label>
                    Prompt positivo
                    <textarea
                      rows="3"
                      value={videoPositivePrompt}
                      onChange={(event) => setVideoPositivePrompt(event.target.value)}
                    />
                  </label>
                  <div className="video-workflow-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={handleSuggestVideoPrompt}
                      disabled={videoPromptSuggestStatus === "loading"}
                    >
                      {videoPromptSuggestStatus === "loading"
                        ? "Analizando imagen con OpenAI..."
                        : "✨ Sugerir prompt IA (Wan 2.2 i2v)"}
                    </button>
                  </div>
                  <label>
                    Prompt negativo
                    <textarea
                      rows="4"
                      value={videoNegativePrompt}
                      onChange={(event) => setVideoNegativePrompt(event.target.value)}
                    />
                  </label>
                  <div className="video-workflow-inline-fields">
                    <label>
                      Duración (frames)
                      <input
                        type="number"
                        min="8"
                        max="240"
                        value={videoFrameLength}
                        onChange={(event) => setVideoFrameLength(event.target.value)}
                      />
                    </label>
                    <label>
                      FPS
                      <input
                        type="number"
                        min="8"
                        max="60"
                        value={videoFps}
                        onChange={(event) => setVideoFps(event.target.value)}
                      />
                    </label>
                    <label>
                      Aspect ratio
                      <select
                        value={videoAspectRatio}
                        onChange={(event) => setVideoAspectRatio(event.target.value)}
                      >
                        <option value="9:16">9:16 · 576×1024</option>
                        <option value="3:4">3:4 · 528×704</option>
                        <option value="1:1">1:1 · 768×768</option>
                        <option value="4:3">4:3 · 704×528</option>
                        <option value="16:9">16:9 · 1024×576</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="primary"
                    type="button"
                    onClick={handleGenerateVideo}
                    disabled={videoGenerationStatus === "loading"}
                  >
                    {videoGenerationStatus === "loading"
                      ? "Generando video..."
                      : "Generar video con workflow"}
                  </button>
                  {videoPromptSuggestError && <p className="error">{videoPromptSuggestError}</p>}
                  {videoGenerationError && <p className="error">{videoGenerationError}</p>}
                </div>
              </div>
            ) : (
              <p className="empty">Selecciona una imagen en la librería para iniciar.</p>
            )}
          </section>

          {generatedVideo && (
            <section className="card">
              <header className="list-header">
                <div>
                  <h2>Video generado</h2>
                  <p className="subtitle">Subido en la carpeta videos de Cloudinary.</p>
                </div>
              </header>
              <div className="reel-grid video-grid">
                <article className="reel-card video-card">
                  <video src={generatedVideo.secureUrl || generatedVideo.url} controls preload="metadata" />
                  <div className="reel-meta">
                    <p className="muted video-public-id">{generatedVideo.publicId}</p>
                    <p className="muted">
                      Ratio: {generatedVideo.aspectRatio || "9:16"}
                      {generatedVideo.resolution
                        ? ` · ${generatedVideo.resolution.width}x${generatedVideo.resolution.height}`
                        : ""}
                    </p>
                    <p className="muted">
                      Audio: {generatedVideo.audioAdded ? "añadido" : "no añadido"}
                    </p>
                  </div>
                </article>
              </div>
            </section>
          )}

          <section className="card">
            <header className="list-header">
              <div>
                <h2>Listado de videos generados</h2>
                <p className="subtitle">
                  {videos.length
                    ? `${videos.length} videos disponibles`
                    : "Aún no hay videos generados."}
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={loadVideos}
                disabled={videosStatus === "loading"}
              >
                Refrescar
              </button>
            </header>
            {videosError && <p className="error">{videosError}</p>}
            {videosStatus === "loading" && <p className="muted">Cargando videos...</p>}
            {videos.length > 0 ? (
              <div className="reel-grid video-grid">
                {videos.map((video) => (
                  <article className="reel-card video-card" key={video.id || video.publicId}>
                    <video src={video.secureUrl || video.url} controls preload="metadata" />
                    <div className="reel-meta">
                      <p className="subtitle">Cuenta: {video.accountName || video.accountId}</p>
                      <p className="muted video-public-id">{video.publicId}</p>
                      <p className="muted">
                        Ratio: {video.aspectRatio || "N/A"}
                        {video.resolution
                          ? ` · ${video.resolution.width}x${video.resolution.height}`
                          : ""}
                      </p>
                      <p className="muted">
                        Audio: {video.audioAdded ? "añadido" : "no añadido"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              videosStatus !== "loading" && (
                <p className="empty">No hay videos generados todavía.</p>
              )
            )}
          </section>
        </main>
      )}

      {view === "videos-overview" && (
        <main className="library-view">
          <header className="library-view-header">
            <div>
              <p className="eyebrow">Videos generados</p>
              <h1>Biblioteca global de videos</h1>
              <p className="subtitle">
                Revisa todos los videos generados sin depender de una imagen específica.
              </p>
            </div>
            <div className="header-actions">
              {selectedAccount && (
                <button className="secondary" onClick={() => setView("account-images")}>
                  Volver a imágenes
                </button>
              )}
              <button className="secondary" onClick={() => setView("home")}>
                Volver a inicio
              </button>
            </div>
          </header>

          <section className="card">
            <header className="list-header">
              <div>
                <h2>Listado de videos generados</h2>
                <p className="subtitle">
                  {videos.length
                    ? `${videos.length} videos disponibles`
                    : "Aún no hay videos generados."}
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={loadVideos}
                disabled={videosStatus === "loading"}
              >
                Refrescar
              </button>
            </header>
            {videosError && <p className="error">{videosError}</p>}
            {videosStatus === "loading" && <p className="muted">Cargando videos...</p>}
            {videos.length > 0 ? (
              <div className="reel-grid video-grid">
                {videos.map((video) => (
                  <article className="reel-card video-card" key={video.id || video.publicId}>
                    <video src={video.secureUrl || video.url} controls preload="metadata" />
                    <div className="reel-meta">
                      <p className="subtitle">Cuenta: {video.accountName || video.accountId}</p>
                      <p className="muted video-public-id">{video.publicId}</p>
                      <p className="muted">
                        Ratio: {video.aspectRatio || "N/A"}
                        {video.resolution
                          ? ` · ${video.resolution.width}x${video.resolution.height}`
                          : ""}
                      </p>
                      <p className="muted">
                        Audio: {video.audioAdded ? "añadido" : "no añadido"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              videosStatus !== "loading" && (
                <p className="empty">No hay videos generados todavía.</p>
              )
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
            <div className="header-actions">
              {selectedAccount && (
                <button
                  className="secondary"
                  onClick={() => setView("account-images")}
                >
                  Volver a imágenes
                </button>
              )}
              <button className="secondary" onClick={() => setView("home")}>
                Volver a inicio
              </button>
            </div>
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
                  <article className="reel-card" key={getReelKey(reel)}>
                    {isReelPreviewVisible(reel) ? (
                      <video
                        src={reel.secureUrl || reel.url}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <div className="reel-preview-hidden">Vista previa desactivada</div>
                    )}
                    <div className="reel-meta">
                      <p className="subtitle">
                        Cuenta: {reel.accountName || reel.accountId}
                      </p>
                      <p className="muted">
                        Imágenes: {reel.imageCount ?? "N/A"}
                      </p>
                      <button
                        className={`secondary small${
                          isReelPreviewVisible(reel) ? " active" : ""
                        }`}
                        type="button"
                        onClick={() => handleToggleReelPreview(reel)}
                      >
                        {isReelPreviewVisible(reel)
                          ? "Desactivar vista previa"
                          : "Activar vista previa"}
                      </button>
                      {reel.copy && (
                        <p className="reel-copy">
                          <span className="label">Copy IA:</span> {reel.copy}
                        </p>
                      )}
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
