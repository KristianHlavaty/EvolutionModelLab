import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Dna,
  FlaskConical,
  FolderOpen,
  History,
  ImagePlus,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import { PromptHistoryPage, RoundWorkspacePage } from "./MilestoneTwo.tsx";
import type { Candidate, Creature, DashboardData, Round } from "./types.ts";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function useRemote<T>(
  loader: () => Promise<T>,
  dependencies: readonly unknown[],
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loader());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

function AppShell({ children }: { children: ReactNode }) {
  const primary = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/creatures", label: "Creatures", icon: Dna },
    { to: "/history", label: "History", icon: History },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Evolution Model Lab home">
          <span className="brand-mark">
            <Dna size={22} strokeWidth={1.8} />
          </span>
          <span>
            <strong>Evolution</strong>
            <small>Model Lab</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {primary.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
          <p className="nav-label nav-section">Future labs</p>
          <span className="nav-disabled">
            <FlaskConical size={18} /> Animation Lab <small>M6</small>
          </span>
          <span className="nav-disabled">
            <Sparkles size={18} /> MCP Bridge <small>M8</small>
          </span>
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/settings">
            <Settings size={18} /> Settings
          </NavLink>
          <div className="local-badge">
            <span /> Local workspace
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

function LoadingPanel() {
  return (
    <div className="loading-panel">
      <span className="spinner" /> Reading the local workspace…
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="error-panel" role="alert">
      <ShieldCheck size={20} /> <span>{message}</span>
    </div>
  );
}

function DashboardPage() {
  const { data, error, loading } = useRemote<DashboardData>(
    () => api("/api/dashboard"),
    [],
  );
  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Dashboard is unavailable."} />;

  const stats = [
    {
      label: "Creatures",
      value: data.totals.creatures,
      detail: "in this workspace",
    },
    {
      label: "Concept rounds",
      value: data.totals.inConcept,
      detail: "awaiting selection",
    },
    {
      label: "Candidates chosen",
      value: data.totals.selected,
      detail: "ready for refinement",
    },
    { label: "Data location", value: "Local", detail: "no cloud dependency" },
  ];
  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="Specimen workspace"
        title="Build a lineage, one decision at a time."
        description="A persistent lab for creature concepts, careful selection, and recoverable iteration."
        action={
          <Link className="button primary" to="/creatures/new">
            <Plus size={17} /> New creature
          </Link>
        }
      />
      <section className="stat-grid" aria-label="Workspace summary">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.detail}</span>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current work</p>
              <h2>Recent creatures</h2>
            </div>
            <Link to="/creatures">
              View all <ArrowRight size={16} />
            </Link>
          </div>
          {data.recentCreatures.length === 0 ? (
            <div className="empty-state compact">
              <Dna size={30} />
              <h3>No specimens yet</h3>
              <p>Create Dunkleosteus or start with a creature of your own.</p>
              <Link className="text-link" to="/creatures/new">
                Create the first creature <ChevronRight size={15} />
              </Link>
            </div>
          ) : (
            data.recentCreatures.map((creature) => (
              <CreatureRow creature={creature} key={creature.id} />
            ))
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h2>Recent activity</h2>
            </div>
            <Activity size={19} />
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="muted">Successful actions will appear here.</p>
          ) : (
            <ol className="activity-list">
              {data.recentActivity.map((event) => (
                <li key={event.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>
                      {event.action.toLowerCase().replaceAll("_", " ")}
                    </strong>
                    <time>{formatDate(event.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function CreatureRow({ creature }: { creature: Creature }) {
  return (
    <Link className="creature-row" to={`/creatures/${creature.id}`}>
      <div className="mini-thumb checkerboard">
        {creature.selectedCandidate ? (
          <img src={creature.selectedCandidate.thumbnailUrl} alt="" />
        ) : (
          <Dna size={22} />
        )}
      </div>
      <div className="creature-row-main">
        <strong>{creature.displayName}</strong>
        <span>{creature.scientificName || "Scientific name not set"}</span>
      </div>
      <span className={`status-pill status-${creature.status.toLowerCase()}`}>
        {statusLabel(creature.status)}
      </span>
      <time>{formatDate(creature.updatedAt)}</time>
      <ChevronRight size={17} />
    </Link>
  );
}

function CreaturesPage() {
  const { data, error, loading } = useRemote<Creature[]>(
    () => api("/api/creatures"),
    [],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const shown = useMemo(
    () =>
      (data ?? []).filter((creature) => {
        const matchesQuery =
          `${creature.displayName} ${creature.scientificName ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesQuery && (status === "ALL" || creature.status === status);
      }),
    [data, query, status],
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Creature index"
        title="Specimens"
        description="Every design keeps its prompt, candidates, and decisions together."
        action={
          <Link className="button primary" to="/creatures/new">
            <Plus size={17} /> New creature
          </Link>
        }
      />
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search creatures"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or taxonomy"
          />
        </label>
        <label className="select-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All stages</option>
            <option value="DRAFT">Draft</option>
            <option value="CONCEPT">Concept</option>
            <option value="CANDIDATE_SELECTED">Candidate selected</option>
            <option value="REFINING">Refining</option>
          </select>
        </label>
      </div>
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={error} />
      ) : shown.length === 0 ? (
        <div className="empty-state panel">
          <Dna size={34} />
          <h2>No matching creatures</h2>
          <p>Change the filters or create a new specimen.</p>
        </div>
      ) : (
        <section className="creature-grid">
          {shown.map((creature) => (
            <CreatureCard key={creature.id} creature={creature} />
          ))}
        </section>
      )}
    </div>
  );
}

function CreatureCard({ creature }: { creature: Creature }) {
  return (
    <Link className="creature-card" to={`/creatures/${creature.id}`}>
      <div className="creature-visual checkerboard">
        {creature.selectedCandidate ? (
          <img
            src={creature.selectedCandidate.thumbnailUrl}
            alt={`Selected ${creature.displayName} candidate`}
          />
        ) : (
          <div className="empty-specimen">
            <Dna size={34} />
            <span>Awaiting concepts</span>
          </div>
        )}
        <span className={`status-pill status-${creature.status.toLowerCase()}`}>
          {statusLabel(creature.status)}
        </span>
      </div>
      <div className="creature-card-body">
        <p className="eyebrow">
          {creature.roundCount} {creature.roundCount === 1 ? "round" : "rounds"}
        </p>
        <h2>{creature.displayName}</h2>
        <p className="scientific">
          {creature.scientificName || "Unclassified specimen"}
        </p>
        <div className="card-meta">
          <span>Updated {formatDate(creature.updatedAt)}</span>
          <ChevronRight size={17} />
        </div>
      </div>
    </Link>
  );
}

function NewCreaturePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: "",
    scientificName: "",
    description: "",
    generationBrief: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const creature = await api<Creature>(
        "/api/creatures",
        jsonRequest("POST", form),
      );
      navigate(`/creatures/${creature.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The creature was not created.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow="New specimen"
        title="Define the creature"
        description="Start with the biological and visual intent. The first concept prompt is generated in the next step."
      />
      <form
        className="panel creature-form"
        onSubmit={(event) => void submit(event)}
      >
        {error && <ErrorPanel message={error} />}
        <div className="field-grid">
          <label>
            <span>
              Display name <b>Required</b>
            </span>
            <input
              required
              autoFocus
              name="displayName"
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              placeholder="Dunkleosteus"
            />
          </label>
          <label>
            <span>Scientific name</span>
            <input
              name="scientificName"
              value={form.scientificName}
              onChange={(event) => update("scientificName", event.target.value)}
              placeholder="Dunkleosteus terrelli"
            />
          </label>
        </div>
        <label>
          <span>Short description</span>
          <textarea
            rows={3}
            name="description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="A placoderm apex predator for a side-view marine game."
          />
        </label>
        <label>
          <span>
            Generation brief <b>Required</b>
          </span>
          <textarea
            required
            rows={7}
            name="generationBrief"
            value={form.generationBrief}
            onChange={(event) => update("generationBrief", event.target.value)}
            placeholder="Describe anatomy, silhouette, visual style, palette, camera, and constraints…"
          />
          <small>This structured brief stays with every future round.</small>
        </label>
        <div className="form-actions">
          <Link className="button secondary" to="/creatures">
            Cancel
          </Link>
          <button
            className="button primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <span className="spinner small" />
            ) : (
              <Dna size={17} />
            )}{" "}
            Create creature
          </button>
        </div>
      </form>
    </div>
  );
}

function CreatureDetailPage() {
  const { creatureId } = useParams();
  const navigate = useNavigate();
  const {
    data: creature,
    error,
    loading,
    reload,
  } = useRemote<Creature>(
    () => api(`/api/creatures/${creatureId}`),
    [creatureId],
  );
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  async function createConcept() {
    setWorking(true);
    setActionError("");
    try {
      const round = await api<Round>(
        `/api/creatures/${creatureId}/rounds/concept`,
        jsonRequest("POST"),
      );
      navigate(`/creatures/${creatureId}/rounds/${round.id}`);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Concept round was not created.",
      );
    } finally {
      setWorking(false);
    }
  }
  if (loading) return <LoadingPanel />;
  if (error || !creature)
    return <ErrorPanel message={error || "Creature not found."} />;
  return (
    <div className="page creature-detail-page">
      <PageHeader
        eyebrow="Creature project"
        title={creature.displayName}
        description={creature.scientificName || "Scientific name not set"}
        action={
          <div className="header-actions">
            {creature.roundCount > 0 && (
              <Link
                className="button secondary"
                to={`/creatures/${creature.id}/prompts`}
              >
                <History size={16} /> Prompt history
              </Link>
            )}
            <span
              className={`status-pill large status-${creature.status.toLowerCase()}`}
            >
              {statusLabel(creature.status)}
            </span>
          </div>
        }
      />
      {actionError && <ErrorPanel message={actionError} />}
      <div className="detail-grid">
        <section className="panel specimen-panel">
          <div className="specimen-stage checkerboard">
            {creature.selectedCandidate ? (
              <img
                src={creature.selectedCandidate.imageUrl}
                alt={`Selected ${creature.displayName} candidate`}
              />
            ) : (
              <div className="empty-specimen">
                <Dna size={42} />
                <strong>No candidate selected</strong>
                <span>Concept images will appear here.</span>
              </div>
            )}
          </div>
          {creature.selectedCandidate && (
            <div className="selected-caption">
              <span>
                <Check size={15} /> Selected candidate{" "}
                {creature.selectedCandidate.candidateNumber}
              </span>
              <Link
                to={`/creatures/${creature.id}/rounds/${creature.currentRoundId}`}
              >
                Review round
              </Link>
            </div>
          )}
        </section>
        <aside className="panel next-step">
          <p className="eyebrow">Recommended next action</p>
          {creature.status === "DRAFT" ? (
            <>
              <h2>Create Concept Round 1</h2>
              <p>
                Model Lab will save a deterministic ten-concept prompt. Use it
                in ChatGPT, then return with the PNG results.
              </p>
              <button
                className="button primary full"
                onClick={() => void createConcept()}
                disabled={working}
              >
                {working ? (
                  <span className="spinner small" />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                Create concept round
              </button>
            </>
          ) : creature.currentRound ? (
            <>
              <h2>
                {creature.status === "CONCEPT"
                  ? "Import concept images"
                  : creature.status === "REFINING"
                    ? "Import refinement images"
                    : "Selection saved"}
              </h2>
              <p>
                {creature.status === "CONCEPT"
                  ? "Add one to ten PNG results and review the numbered gallery."
                  : creature.status === "REFINING"
                    ? "Import refinements, compare them, and select the next parent."
                    : "Record structured feedback and create the next refinement round."}
              </p>
              <Link
                className="button primary full"
                to={`/creatures/${creature.id}/rounds/${creature.currentRound.id}`}
              >
                <FolderOpen size={17} /> Open current round
              </Link>
            </>
          ) : null}
          <div className="safety-note">
            <ShieldCheck size={17} />
            <span>
              Images stay inside this repository. Originals are never modified.
            </span>
          </div>
        </aside>
      </div>
      <section className="panel project-brief">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Persistent context</p>
            <h2>Generation brief</h2>
          </div>
        </div>
        <p>{creature.generationBrief}</p>
        {creature.description && (
          <div className="brief-note">
            <strong>Project note</strong>
            <span>{creature.description}</span>
          </div>
        )}
      </section>
      <section className="round-history">
        <div className="section-title">
          <div>
            <p className="eyebrow">Immutable record</p>
            <h2>Round history</h2>
          </div>
        </div>
        {(creature.rounds ?? []).length === 0 ? (
          <div className="panel empty-inline">No generation rounds yet.</div>
        ) : (
          <div className="timeline">
            {creature.rounds?.map((round) => (
              <Link
                key={round.id}
                to={`/creatures/${creature.id}/rounds/${round.id}`}
                className="timeline-card"
              >
                <span className="round-index">
                  {String(round.roundNumber).padStart(2, "0")}
                </span>
                <div>
                  <strong>{statusLabel(round.roundType)} round</strong>
                  <span>
                    {round.candidateCount} candidates ·{" "}
                    {formatDate(round.createdAt)}
                  </span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        )}
      </section>
      <button className="visually-hidden" onClick={() => void reload()}>
        Reload
      </button>
    </div>
  );
}

export function MilestoneOneRoundPage() {
  const { creatureId, roundId } = useParams();
  const {
    data: round,
    setData: setRound,
    error,
    loading,
    reload,
  } = useRemote<Round>(() => api(`/api/rounds/${roundId}`), [roundId]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const importFiles = useCallback(
    async (fileList: File[] | FileList, source: "MANUAL" | "CLIPBOARD") => {
      const files = Array.from(fileList);
      if (!round || !creatureId || files.length === 0) return;
      setUploading(true);
      setUploadError("");
      const body = new FormData();
      files.forEach((file) => body.append("images", file));
      body.append("source", source);
      try {
        await api<Candidate[]>(
          `/api/creatures/${creatureId}/rounds/${round.id}/candidates`,
          { method: "POST", body },
        );
        await reload();
        if (fileInput.current) fileInput.current.value = "";
      } catch (cause) {
        setUploadError(
          cause instanceof Error ? cause.message : "Images were not imported.",
        );
      } finally {
        setUploading(false);
      }
    },
    [creatureId, reload, round],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const images = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length > 0) {
        event.preventDefault();
        void importFiles(images, "CLIPBOARD");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importFiles]);

  async function select(candidateId: string) {
    if (!round) return;
    setUploadError("");
    try {
      await api(
        `/api/rounds/${round.id}/select`,
        jsonRequest("POST", { candidateId }),
      );
      const updated = await api<Round>(`/api/rounds/${round.id}`);
      setRound(updated);
    } catch (cause) {
      setUploadError(
        cause instanceof Error ? cause.message : "Candidate selection failed.",
      );
    }
  }

  async function copyPrompt() {
    if (!round) return;
    try {
      await navigator.clipboard.writeText(round.generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setUploadError(
        "Clipboard access was blocked. Select and copy the prompt manually.",
      );
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void importFiles(event.dataTransfer.files, "MANUAL");
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void importFiles(event.target.files, "MANUAL");
  }
  if (loading) return <LoadingPanel />;
  if (error || !round)
    return <ErrorPanel message={error || "Round not found."} />;
  const remaining = 10 - round.candidates.length;
  return (
    <div className="page round-page">
      <PageHeader
        eyebrow={`Generation round ${String(round.roundNumber).padStart(2, "0")}`}
        title={`${statusLabel(round.roundType)} candidates`}
        description="Generate in ChatGPT, import the real PNG results, then choose exactly one parent."
        action={
          <Link className="button secondary" to={`/creatures/${creatureId}`}>
            Back to creature
          </Link>
        }
      />
      {uploadError && <ErrorPanel message={uploadError} />}
      <section className="prompt-panel panel">
        <div className="prompt-copy">
          <div>
            <p className="eyebrow">ChatGPT handoff</p>
            <h2>Generation prompt</h2>
            <p>
              Attach no parent image for the first concept round. Ask ChatGPT
              with this saved prompt.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => void copyPrompt()}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <pre tabIndex={0}>{round.generatedPrompt}</pre>
        <p className="handoff-note">
          <Clipboard size={16} /> When ChatGPT finishes, save the PNGs or copy
          an image, then return here. No API key is used.
        </p>
      </section>
      {remaining > 0 && (
        <section
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/png,.png"
            multiple
            onChange={choose}
            aria-label="Import candidate PNG images"
          />
          <div className="upload-icon">
            {uploading ? (
              <span className="spinner" />
            ) : (
              <UploadCloud size={26} />
            )}
          </div>
          <h2>
            {uploading ? "Validating and saving…" : "Drop candidate PNGs here"}
          </h2>
          <p>
            Choose 1–{remaining} files, or paste images from the clipboard.
            Originals remain byte-for-byte unchanged.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            <ImagePlus size={17} /> Choose PNG files
          </button>
          <span className="upload-limit">
            PNG only · 10 MB each · up to 4096 × 4096
          </span>
        </section>
      )}
      <section className="gallery-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">Candidate gallery</p>
            <h2>
              {round.candidates.length === 0
                ? "Awaiting concepts"
                : `${round.candidates.length} of 10 candidates`}
            </h2>
          </div>
          {round.candidates.some((candidate) => candidate.selected) && (
            <span className="selection-confirmation">
              <Check size={15} /> Selection persisted
            </span>
          )}
        </div>
        {round.candidates.length === 0 ? (
          <div className="panel empty-state compact">
            <ImagePlus size={30} />
            <h3>No candidates imported</h3>
            <p>
              The gallery uses real files only. Import ChatGPT results above.
            </p>
          </div>
        ) : (
          <div className="candidate-grid">
            {round.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onSelect={() => void select(candidate.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CandidateCard({
  candidate,
  onSelect,
}: {
  candidate: Candidate;
  onSelect: () => void;
}) {
  return (
    <article
      className={`candidate-card ${candidate.selected ? "selected" : ""}`}
      data-testid={`candidate-${candidate.candidateNumber}`}
    >
      <div className="candidate-image checkerboard">
        <a
          href={candidate.imageUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open candidate ${candidate.candidateNumber} full size`}
        >
          <img
            src={candidate.thumbnailUrl}
            alt={`Candidate ${candidate.candidateNumber}`}
          />
        </a>
        <span className="candidate-number">
          {String(candidate.candidateNumber).padStart(2, "0")}
        </span>
        {candidate.selected && (
          <span className="selected-flag">
            <Check size={14} /> Selected
          </span>
        )}
      </div>
      <div className="candidate-info">
        <div>
          <strong>Candidate {candidate.candidateNumber}</strong>
          <span>
            {candidate.width} × {candidate.height} ·{" "}
            {candidate.hasAlpha ? "alpha" : "opaque"}
          </span>
        </div>
        <button
          className={
            candidate.selected ? "button selected-button" : "button secondary"
          }
          onClick={onSelect}
          disabled={candidate.selected}
        >
          {candidate.selected ? (
            <>
              <Check size={16} /> Parent selected
            </>
          ) : (
            "Select parent"
          )}
        </button>
      </div>
    </article>
  );
}

function FutureFeaturePage({
  title,
  milestone,
}: {
  title: string;
  milestone: string;
}) {
  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow="Planned capability"
        title={title}
        description={`This surface is intentionally deferred to ${milestone}. Milestone 2 does not expose non-functional actions.`}
      />
      <div className="panel future-panel">
        <FlaskConical size={34} />
        <h2>The foundation is ready</h2>
        <p>
          Creature state, immutable originals, prompts, and history are already
          arranged for this module. Implementation will follow the gated project
          plan.
        </p>
        <Link className="button secondary" to="/">
          Return to overview
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/creatures" element={<CreaturesPage />} />
        <Route path="/creatures/new" element={<NewCreaturePage />} />
        <Route path="/creatures/:creatureId" element={<CreatureDetailPage />} />
        <Route
          path="/creatures/:creatureId/rounds/:roundId"
          element={<RoundWorkspacePage />}
        />
        <Route
          path="/creatures/:creatureId/prompts"
          element={<PromptHistoryPage />}
        />
        <Route
          path="/creatures/:creatureId/evolution"
          element={
            <FutureFeaturePage title="Evolution tree" milestone="Milestone 4" />
          }
        />
        <Route
          path="/creatures/:creatureId/manifest"
          element={
            <FutureFeaturePage
              title="Design manifest"
              milestone="Milestone 3"
            />
          }
        />
        <Route
          path="/creatures/:creatureId/references"
          element={
            <FutureFeaturePage
              title="Canonical references"
              milestone="Milestone 5"
            />
          }
        />
        <Route
          path="/creatures/:creatureId/animations"
          element={
            <FutureFeaturePage title="Animation Lab" milestone="Milestone 6" />
          }
        />
        <Route
          path="/creatures/:creatureId/animations/:animationId"
          element={
            <FutureFeaturePage
              title="Animation review"
              milestone="Milestone 6"
            />
          }
        />
        <Route
          path="/creatures/:creatureId/export"
          element={
            <FutureFeaturePage
              title="Game-ready export"
              milestone="Milestone 7"
            />
          }
        />
        <Route
          path="/settings"
          element={
            <FutureFeaturePage
              title="Project settings"
              milestone="Milestone 5"
            />
          }
        />
        <Route
          path="/history"
          element={
            <FutureFeaturePage
              title="Complete history browser"
              milestone="Milestone 3"
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
