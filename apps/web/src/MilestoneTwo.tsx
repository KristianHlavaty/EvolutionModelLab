import {
  Check,
  Clipboard,
  Columns2,
  Copy,
  ImagePlus,
  Layers,
  Save,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type {
  Candidate,
  CandidateFeedback,
  ContactSheetPreview,
  Creature,
  PromptHistoryEntry,
  Round,
} from "./types.ts";

type FeedbackDraft = Omit<
  CandidateFeedback,
  "candidateId" | "createdAt" | "updatedAt"
>;

type FeedbackTextDraft = {
  [Key in Exclude<keyof FeedbackDraft, "generalNotes">]: string;
} & { generalNotes: string };

const emptyFeedback: FeedbackDraft = {
  preserveTraits: [],
  anatomyToPreserve: [],
  paletteToPreserve: [],
  silhouetteToPreserve: [],
  defects: [],
  requestedChanges: [],
  forbiddenChanges: [],
  generalNotes: "",
};

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function feedbackText(value: FeedbackDraft): FeedbackTextDraft {
  return {
    preserveTraits: value.preserveTraits.join("\n"),
    anatomyToPreserve: value.anatomyToPreserve.join("\n"),
    paletteToPreserve: value.paletteToPreserve.join("\n"),
    silhouetteToPreserve: value.silhouetteToPreserve.join("\n"),
    defects: value.defects.join("\n"),
    requestedChanges: value.requestedChanges.join("\n"),
    forbiddenChanges: value.forbiddenChanges.join("\n"),
    generalNotes: value.generalNotes,
  };
}

function title(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-panel" role="alert">
      {message}
    </div>
  );
}

function FeedbackEditor({
  candidate,
  onSaved,
}: {
  candidate: Candidate;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<FeedbackTextDraft>(
    feedbackText(candidate.feedback ?? emptyFeedback),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(feedbackText(candidate.feedback ?? emptyFeedback));
  }, [candidate.id, candidate.feedback]);

  useEffect(() => {
    setSaved(false);
  }, [candidate.id]);

  const categories: Array<{
    key: Exclude<keyof FeedbackDraft, "generalNotes">;
    label: string;
    hint: string;
  }> = [
    {
      key: "preserveTraits",
      label: "Preserve traits",
      hint: "One trait per line, in priority order",
    },
    {
      key: "anatomyToPreserve",
      label: "Anatomy to preserve",
      hint: "Body structures and proportions",
    },
    {
      key: "paletteToPreserve",
      label: "Palette to preserve",
      hint: "Colours, markings, and materials",
    },
    {
      key: "silhouetteToPreserve",
      label: "Silhouette to preserve",
      hint: "Readable outline and massing",
    },
    {
      key: "defects",
      label: "Defects",
      hint: "Problems that must be corrected",
    },
    {
      key: "requestedChanges",
      label: "Requested changes",
      hint: "Specific refinements to make",
    },
    {
      key: "forbiddenChanges",
      label: "Forbidden changes",
      hint: "Changes the next round must avoid",
    },
  ];

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const payload: FeedbackDraft = {
        preserveTraits: lines(draft.preserveTraits),
        anatomyToPreserve: lines(draft.anatomyToPreserve),
        paletteToPreserve: lines(draft.paletteToPreserve),
        silhouetteToPreserve: lines(draft.silhouetteToPreserve),
        defects: lines(draft.defects),
        requestedChanges: lines(draft.requestedChanges),
        forbiddenChanges: lines(draft.forbiddenChanges),
        generalNotes: draft.generalNotes.trim(),
      };
      await api(
        `/api/candidates/${candidate.id}/feedback`,
        jsonRequest("PATCH", payload),
      );
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Feedback was not saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="panel feedback-editor"
      onSubmit={(event) => void save(event)}
    >
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Selected parent</p>
          <h2>Structured refinement feedback</h2>
          <p>
            Entries stay ordered and are copied into the next immutable round.
          </p>
        </div>
        <span className="candidate-token">
          Candidate {candidate.candidateNumber}
        </span>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="feedback-grid">
        {categories.map((category) => (
          <label key={category.key}>
            <span>{category.label}</span>
            <small>{category.hint}</small>
            <textarea
              aria-label={category.label}
              value={draft[category.key]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [category.key]: event.target.value,
                }))
              }
              rows={4}
            />
          </label>
        ))}
        <label className="feedback-notes">
          <span>General notes</span>
          <small>Additional context that does not fit a category</small>
          <textarea
            aria-label="General notes"
            value={draft.generalNotes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                generalNotes: event.target.value,
              }))
            }
            rows={4}
          />
        </label>
      </div>
      <button className="button primary" disabled={saving}>
        {saved ? <Check size={16} /> : <Save size={16} />}
        {saving ? "Saving…" : saved ? "Feedback saved" : "Save feedback"}
      </button>
    </form>
  );
}

interface ViewState {
  zoom: number;
  x: number;
  y: number;
}

function ComparisonPanel({
  candidates,
  roundNumber,
  onClose,
}: {
  candidates: [Candidate, Candidate];
  roundNumber: number;
  onClose: () => void;
}) {
  const [synchronized, setSynchronized] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [views, setViews] = useState<[ViewState, ViewState]>([
    { zoom: 1, x: 50, y: 50 },
    { zoom: 1, x: 50, y: 50 },
  ]);

  function update(index: 0 | 1, field: keyof ViewState, value: number) {
    setViews((current) => {
      const next: [ViewState, ViewState] = [
        { ...current[0] },
        { ...current[1] },
      ];
      next[index][field] = value;
      if (synchronized) next[index === 0 ? 1 : 0][field] = value;
      return next;
    });
  }

  const image = (candidate: Candidate, index: 0 | 1) => (
    <div className="comparison-item">
      <div className="comparison-viewport checkerboard">
        <img
          src={candidate.imageUrl}
          alt={`Candidate ${candidate.candidateNumber} comparison`}
          style={{
            transform: `scale(${views[index].zoom})`,
            transformOrigin: `${views[index].x}% ${views[index].y}%`,
          }}
        />
      </div>
      <strong>Candidate {candidate.candidateNumber}</strong>
      <span>
        Round {roundNumber} · {candidate.width} × {candidate.height}
      </span>
      <label>
        Zoom
        <input
          aria-label={`Candidate ${candidate.candidateNumber} zoom`}
          type="range"
          min="1"
          max="4"
          step="0.1"
          value={views[index].zoom}
          onChange={(event) =>
            update(index, "zoom", Number(event.target.value))
          }
        />
      </label>
      <div className="pan-controls">
        <label>
          Pan X
          <input
            aria-label={`Candidate ${candidate.candidateNumber} pan X`}
            type="range"
            min="0"
            max="100"
            value={views[index].x}
            onChange={(event) => update(index, "x", Number(event.target.value))}
          />
        </label>
        <label>
          Pan Y
          <input
            aria-label={`Candidate ${candidate.candidateNumber} pan Y`}
            type="range"
            min="0"
            max="100"
            value={views[index].y}
            onChange={(event) => update(index, "y", Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );

  return (
    <section
      className="panel comparison-panel"
      aria-label="Candidate comparison"
    >
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Visual inspection</p>
          <h2>Compare two candidates</h2>
        </div>
        <button className="button secondary" onClick={onClose}>
          Close comparison
        </button>
      </div>
      <div className="comparison-options">
        <label>
          <input
            type="checkbox"
            checked={synchronized}
            onChange={(event) => setSynchronized(event.target.checked)}
          />
          Synchronized view
        </label>
        <label>
          <input
            type="checkbox"
            checked={overlay}
            onChange={(event) => setOverlay(event.target.checked)}
          />
          Overlay mode
        </label>
      </div>
      {overlay ? (
        <div className="overlay-comparison checkerboard">
          <img
            src={candidates[0].imageUrl}
            alt={`Candidate ${candidates[0].candidateNumber}`}
          />
          <img
            src={candidates[1].imageUrl}
            alt={`Candidate ${candidates[1].candidateNumber}`}
            style={{ opacity: opacity / 100 }}
          />
          <label>
            Overlay opacity
            <input
              aria-label="Overlay opacity"
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
        </div>
      ) : (
        <div className="comparison-grid">
          {image(candidates[0], 0)}
          {image(candidates[1], 1)}
        </div>
      )}
    </section>
  );
}

function ContactSheetImporter({
  creatureId,
  round,
  onImported,
}: {
  creatureId: string;
  round: Round;
  onImported: () => Promise<void>;
}) {
  const [preset, setPreset] = useState("2x5");
  const [layout, setLayout] = useState({
    rows: 2,
    columns: 5,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    horizontalGap: 0,
    verticalGap: 0,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactSheetPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  function choosePreset(value: string) {
    setPreset(value);
    if (value !== "custom") {
      const [rows, columns] = value.split("x").map(Number) as [number, number];
      setLayout((current) => ({ ...current, rows, columns }));
    }
    setPreview(null);
  }

  async function previewSheet(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      const body = new FormData();
      body.append("image", file);
      Object.entries(layout).forEach(([key, value]) =>
        body.append(key, String(value)),
      );
      const result = await api<ContactSheetPreview>(
        `/api/creatures/${creatureId}/rounds/${round.id}/contact-sheets/preview`,
        { method: "POST", body },
      );
      setPreview(result);
      setSelected(
        result.rectangles
          .slice(0, Math.max(0, 10 - round.candidates.length))
          .map((rectangle) => rectangle.index),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Preview could not be created.",
      );
    } finally {
      setWorking(false);
    }
  }

  function toggle(index: number) {
    setSelected((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : current.length < 10 - round.candidates.length
          ? [...current, index]
          : current,
    );
  }

  async function confirm() {
    if (!preview) return;
    setWorking(true);
    setError("");
    try {
      await api<Candidate[]>(
        `/api/contact-sheets/${preview.id}/confirm`,
        jsonRequest("POST", { selectedCropIndexes: selected }),
      );
      setPreview(null);
      setFile(null);
      await onImported();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Contact sheet was not confirmed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="panel contact-sheet-panel">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Contact-sheet import</p>
          <h2>Preview every crop before creating candidates</h2>
          <p>
            The uploaded original is preserved; confirmed cells become separate
            derived PNGs.
          </p>
        </div>
        <Layers size={22} />
      </div>
      {error && <ErrorNotice message={error} />}
      {!preview ? (
        <form
          className="contact-sheet-form"
          onSubmit={(event) => void previewSheet(event)}
        >
          <label>
            Layout
            <select
              value={preset}
              onChange={(event) => choosePreset(event.target.value)}
            >
              <option value="2x5">2 × 5</option>
              <option value="5x2">5 × 2</option>
              <option value="3x3">3 × 3</option>
              <option value="4x3">4 × 3</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {preset === "custom" && (
            <>
              <label>
                Rows
                <input
                  aria-label="Contact sheet rows"
                  type="number"
                  min="1"
                  max="10"
                  value={layout.rows}
                  onChange={(event) =>
                    setLayout((current) => ({
                      ...current,
                      rows: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Columns
                <input
                  aria-label="Contact sheet columns"
                  type="number"
                  min="1"
                  max="10"
                  value={layout.columns}
                  onChange={(event) =>
                    setLayout((current) => ({
                      ...current,
                      columns: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </>
          )}
          {(
            [
              "marginTop",
              "marginRight",
              "marginBottom",
              "marginLeft",
              "horizontalGap",
              "verticalGap",
            ] as const
          ).map((key) => (
            <label key={key}>
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (letter) => letter.toUpperCase())}
              <input
                aria-label={key.replace(/([A-Z])/g, " $1")}
                type="number"
                min="0"
                value={layout[key]}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
          <label className="contact-file">
            Contact-sheet PNG
            <input
              aria-label="Contact-sheet PNG"
              required
              type="file"
              accept="image/png,.png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button secondary" disabled={!file || working}>
            <ImagePlus size={16} />{" "}
            {working ? "Preparing preview…" : "Preview crops"}
          </button>
        </form>
      ) : (
        <div className="contact-preview">
          <div className="contact-preview-copy">
            <strong>{preview.originalFilename}</strong>
            <span>
              {preview.width} × {preview.height} · {preview.rectangles.length}{" "}
              calculated cells
            </span>
            <p>
              Select up to {10 - round.candidates.length} cells. Candidate
              numbers follow row-major crop order.
            </p>
          </div>
          <div
            className="contact-sheet-stage"
            style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
          >
            <img src={preview.imageUrl} alt="Contact-sheet crop preview" />
            {preview.rectangles.map((rectangle) => (
              <button
                type="button"
                key={rectangle.index}
                className={
                  selected.includes(rectangle.index)
                    ? "crop-rectangle selected"
                    : "crop-rectangle"
                }
                aria-label={`Crop ${rectangle.index + 1}`}
                aria-pressed={selected.includes(rectangle.index)}
                onClick={() => toggle(rectangle.index)}
                style={{
                  left: `${(rectangle.x / preview.width) * 100}%`,
                  top: `${(rectangle.y / preview.height) * 100}%`,
                  width: `${(rectangle.width / preview.width) * 100}%`,
                  height: `${(rectangle.height / preview.height) * 100}%`,
                }}
              >
                {rectangle.index + 1}
              </button>
            ))}
          </div>
          <div className="contact-confirm">
            <button
              className="button secondary"
              onClick={() => setPreview(null)}
            >
              Change layout
            </button>
            <button
              className="button primary"
              onClick={() => void confirm()}
              disabled={selected.length === 0 || working}
            >
              <Check size={16} /> Confirm {selected.length} crops
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function RoundWorkspacePage() {
  const { creatureId = "", roundId = "" } = useParams();
  const navigate = useNavigate();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setRound(await api<Round>(`/api/rounds/${roundId}`));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Round could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const importFiles = useCallback(
    async (fileList: File[] | FileList, source: "MANUAL" | "CLIPBOARD") => {
      const files = Array.from(fileList);
      if (!round || files.length === 0) return;
      setWorking(true);
      setError("");
      const body = new FormData();
      files.forEach((file) => body.append("images", file));
      body.append("source", source);
      try {
        await api(
          `/api/creatures/${creatureId}/rounds/${round.id}/candidates`,
          { method: "POST", body },
        );
        await reload();
        if (fileInput.current) fileInput.current.value = "";
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Images were not imported.",
        );
      } finally {
        setWorking(false);
      }
    },
    [creatureId, reload, round],
  );

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const images = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length > 0) {
        event.preventDefault();
        void importFiles(images, "CLIPBOARD");
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [importFiles]);

  async function select(candidateId: string) {
    setError("");
    try {
      await api(
        `/api/rounds/${roundId}/select`,
        jsonRequest("POST", { candidateId }),
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Candidate selection failed.",
      );
    }
  }

  async function createRefinement() {
    setWorking(true);
    setError("");
    try {
      const next = await api<Round>(
        `/api/creatures/${creatureId}/rounds/refinement`,
        jsonRequest("POST"),
      );
      navigate(`/creatures/${creatureId}/rounds/${next.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Refinement round was not created.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function copyRoundPrompt() {
    if (!round) return;
    try {
      await navigator.clipboard.writeText(round.generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(
        "Clipboard access was blocked. Select and copy the prompt manually.",
      );
    }
  }

  function toggleCompare(candidateId: string) {
    setComparisonIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : current.length < 2
          ? [...current, candidateId]
          : [current[1]!, candidateId],
    );
  }

  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading the local workspace…
      </div>
    );
  if (!round)
    return (
      <div className="page">
        <ErrorNotice message={error || "Round not found."} />
      </div>
    );
  const selectedParent = round.candidates.find(
    (candidate) => candidate.selected,
  );
  const compared = comparisonIds
    .map((id) => round.candidates.find((candidate) => candidate.id === id))
    .filter(Boolean) as Candidate[];
  const remaining = 10 - round.candidates.length;

  return (
    <div className="page round-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            Generation round {String(round.roundNumber).padStart(2, "0")}
          </p>
          <h1>{title(round.roundType)} candidates</h1>
          <p>
            Import real PNGs, compare independently, then choose exactly one
            parent.
          </p>
        </div>
        <div className="header-actions">
          <Link
            className="button secondary"
            to={`/creatures/${creatureId}/prompts`}
          >
            Prompt history
          </Link>
          <Link className="button secondary" to={`/creatures/${creatureId}`}>
            Back to creature
          </Link>
        </div>
      </header>
      {error && <ErrorNotice message={error} />}
      <section className="prompt-panel panel">
        <div className="prompt-copy">
          <div>
            <p className="eyebrow">ChatGPT handoff</p>
            <h2>Generation prompt</h2>
            <p>
              {round.roundType === "REFINEMENT"
                ? "Attach the selected parent image, then use this frozen refinement prompt."
                : "Use this saved concept prompt without a parent image."}
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => void copyRoundPrompt()}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        {round.parentCandidate && (
          <p className="parent-reference">
            Parent candidate {round.parentCandidate.candidateNumber} from round
            history
          </p>
        )}
        <pre tabIndex={0}>{round.generatedPrompt}</pre>
        <p className="handoff-note">
          <Clipboard size={16} /> No image-generation API is called by this
          application.
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
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void importFiles(event.dataTransfer.files, "MANUAL");
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/png,.png"
            multiple
            aria-label="Import candidate PNG images"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              event.target.files &&
              void importFiles(event.target.files, "MANUAL")
            }
          />
          <UploadCloud size={28} />
          <h2>
            {working ? "Validating and saving…" : "Drop candidate PNGs here"}
          </h2>
          <p>
            Choose 1–{remaining} separate files, paste images, or use the
            contact-sheet workflow below.
          </p>
          <button
            className="button secondary"
            onClick={() => fileInput.current?.click()}
            disabled={working}
          >
            <ImagePlus size={16} /> Choose PNG files
          </button>
        </section>
      )}
      <section className="gallery-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">Candidate gallery</p>
            <h2>{round.candidates.length} of 10 candidates</h2>
          </div>
          {selectedParent && (
            <span className="selection-confirmation">
              <Check size={15} /> Selection persisted
            </span>
          )}
        </div>
        {round.candidates.length === 0 ? (
          <div className="panel empty-state compact">
            <ImagePlus size={30} />
            <h3>No candidates imported</h3>
            <p>Import real generated PNGs to begin review.</p>
          </div>
        ) : (
          <div className="candidate-grid">
            {round.candidates.map((candidate) => (
              <article
                className={`candidate-card ${candidate.selected ? "selected" : ""} ${candidate.locked ? "locked" : ""}`}
                data-testid={`candidate-${candidate.candidateNumber}`}
                key={candidate.id}
              >
                <div className="candidate-image checkerboard">
                  <img
                    src={candidate.thumbnailUrl}
                    alt={`Candidate ${candidate.candidateNumber}`}
                  />
                  <span className="candidate-number">
                    {String(candidate.candidateNumber).padStart(2, "0")}
                  </span>
                  {candidate.selected && (
                    <span className="selected-flag">
                      <Check size={14} /> Selected
                    </span>
                  )}
                  {candidate.locked && (
                    <span className="locked-flag">
                      <ShieldCheck size={14} /> Locked design
                    </span>
                  )}
                </div>
                <div className="candidate-info">
                  <div>
                    <strong>Candidate {candidate.candidateNumber}</strong>
                    <span>
                      {candidate.width} × {candidate.height} ·{" "}
                      {candidate.source.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
                <div className="candidate-actions">
                  <button
                    className={
                      candidate.selected
                        ? "button selected-button"
                        : "button secondary"
                    }
                    onClick={() => void select(candidate.id)}
                    disabled={candidate.selected}
                  >
                    {candidate.selected ? "Parent selected" : "Select parent"}
                  </button>
                  <button
                    className={
                      comparisonIds.includes(candidate.id)
                        ? "button compare-selected"
                        : "button secondary"
                    }
                    aria-pressed={comparisonIds.includes(candidate.id)}
                    onClick={() => toggleCompare(candidate.id)}
                  >
                    <Columns2 size={15} />{" "}
                    {comparisonIds.includes(candidate.id)
                      ? "Comparing"
                      : "Compare"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {compared.length === 2 && (
        <ComparisonPanel
          candidates={compared as [Candidate, Candidate]}
          roundNumber={round.roundNumber}
          onClose={() => setComparisonIds([])}
        />
      )}
      {selectedParent && (
        <FeedbackEditor candidate={selectedParent} onSaved={reload} />
      )}
      {selectedParent && (
        <section className="panel refinement-action">
          <div>
            <p className="eyebrow">Next immutable step</p>
            <h2>Create refinement round {round.roundNumber + 1}</h2>
            <p>
              The selected parent and latest saved feedback will be frozen into
              a deterministic prompt and generation context.
            </p>
          </div>
          <button
            className="button primary"
            disabled={working}
            onClick={() => void createRefinement()}
          >
            <Sparkles size={17} /> Create refinement round
          </button>
        </section>
      )}
      {remaining > 0 && (
        <ContactSheetImporter
          creatureId={creatureId}
          round={round}
          onImported={reload}
        />
      )}
    </div>
  );
}

export function PromptHistoryPage() {
  const { creatureId = "" } = useParams();
  const [creature, setCreature] = useState<Creature | null>(null);
  const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void Promise.all([
      api<Creature>(`/api/creatures/${creatureId}`),
      api<PromptHistoryEntry[]>(`/api/creatures/${creatureId}/prompts`),
    ])
      .then(([loadedCreature, loadedEntries]) => {
        setCreature(loadedCreature);
        setEntries(loadedEntries);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Prompt history could not be loaded.",
        ),
      );
  }, [creatureId]);

  async function copyHistoryPrompt(entry: PromptHistoryEntry) {
    try {
      await navigator.clipboard.writeText(entry.generatedPrompt);
      setCopied(entry.roundId);
    } catch {
      setError(
        "Clipboard access was blocked. Select and copy the prompt manually.",
      );
    }
  }

  if (error)
    return (
      <div className="page">
        <ErrorNotice message={error} />
      </div>
    );
  if (!creature)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading prompt history…
      </div>
    );
  return (
    <div className="page prompt-history-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Immutable prompt record</p>
          <h1>{creature.displayName} prompt history</h1>
          <p>
            Every concept and refinement request remains available with its
            parent and feedback snapshot.
          </p>
        </div>
        <Link className="button secondary" to={`/creatures/${creature.id}`}>
          Back to creature
        </Link>
      </header>
      <div className="prompt-history-list">
        {entries.map((entry) => (
          <article className="panel prompt-history-card" key={entry.roundId}>
            <div className="section-title compact-title">
              <div>
                <p className="eyebrow">
                  Round {entry.roundNumber} · {title(entry.roundType)}
                </p>
                <h2>{formatDate(entry.createdAt)}</h2>
                {entry.parentCandidate && (
                  <p>
                    Parent candidate {entry.parentCandidate.candidateNumber}
                  </p>
                )}
              </div>
              <button
                className="button secondary"
                onClick={() => void copyHistoryPrompt(entry)}
              >
                <Copy size={15} />{" "}
                {copied === entry.roundId ? "Copied" : "Copy"}
              </button>
            </div>
            {entry.feedbackSnapshot && (
              <div className="feedback-snapshot">
                {Object.entries(entry.feedbackSnapshot).map(([key, value]) => (
                  <div key={key}>
                    <strong>{key.replace(/([A-Z])/g, " $1")}</strong>
                    <span>
                      {Array.isArray(value)
                        ? value.join(" · ") || "None"
                        : value || "None"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <pre>{entry.generatedPrompt}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}
