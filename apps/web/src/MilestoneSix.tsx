import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  Eye,
  FileWarning,
  ImagePlus,
  Layers3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type {
  Animation,
  AnimationFrame,
  Creature,
  FrameRole,
  ReferenceContext,
} from "./types.ts";

const animationTypes = [
  "IDLE",
  "SWIM",
  "WALK",
  "RUN",
  "ATTACK",
  "HURT",
  "DEATH",
  "EAT",
  "LEVEL_UP",
  "CUSTOM",
];
const frameRoles: FrameRole[] = ["KEY_POSE", "INTERMEDIATE", "REPAIR", "HOLD"];

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function LabHeader({ animation }: { animation: Animation }) {
  return (
    <header className="page-header animation-header">
      <div>
        <p className="eyebrow">Animation Lab · {label(animation.status)}</p>
        <h1>{animation.name}</h1>
        <p>
          {label(animation.animationType)} · {animation.frames.length} of{" "}
          {animation.expectedFrameCount} frames · {animation.fps} FPS
        </p>
      </div>
      <Link
        className="button secondary"
        to={`/creatures/${animation.creatureProjectId}/animations`}
      >
        <ArrowLeft size={16} /> All animations
      </Link>
    </header>
  );
}

export function AnimationsPage() {
  const { creatureId = "" } = useParams();
  const navigate = useNavigate();
  const [animations, setAnimations] = useState<Animation[]>([]);
  const [context, setContext] = useState<ReferenceContext | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({
    name: "8-frame swim",
    animationType: "SWIM",
    fps: 12,
    expectedFrameCount: 8,
    looping: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, referenceContext, detail] = await Promise.all([
        api<Animation[]>(`/api/creatures/${creatureId}/animations`),
        api<ReferenceContext>(`/api/creatures/${creatureId}/references`),
        api<Creature>(`/api/creatures/${creatureId}`),
      ]);
      setAnimations(items);
      setContext(referenceContext);
      setCreature(detail);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load animations.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatureId]);

  useEffect(() => void load(), [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!creature?.manifest) return;
    setWorking(true);
    setError("");
    try {
      const created = await api<Animation>(
        `/api/creatures/${creatureId}/animations`,
        jsonRequest("POST", {
          ...form,
          canvasWidth: creature.manifest.canvasWidth,
          canvasHeight: creature.manifest.canvasHeight,
          actor: "LOCAL_USER",
        }),
      );
      navigate(`/creatures/${creatureId}/animations/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Animation creation failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="panel">Loading animation workspace…</div>;
  return (
    <div className="page animation-list-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone 6 · local frame workflow</p>
          <h1>Animation Lab</h1>
          <p>
            Create real frame sequences anchored to the current approved design.
          </p>
        </div>
        <Link className="button secondary" to={`/creatures/${creatureId}`}>
          <ArrowLeft size={16} /> Creature
        </Link>
      </header>
      {error && <div className="error-panel">{error}</div>}
      {!context?.animationGateSatisfied && (
        <section className="panel animation-gate" data-testid="animation-gate">
          <AlertTriangle size={22} />
          <div>
            <h2>Canonical references are incomplete</h2>
            <p>
              Approve the current locked design and every mandatory reference
              first. Missing:{" "}
              {context?.missingMandatoryReferenceTypes.map(label).join(", ") ||
                "active design lock"}
              .
            </p>
          </div>
          <Link
            className="button primary"
            to={`/creatures/${creatureId}/references`}
          >
            Open references
          </Link>
        </section>
      )}
      {context?.animationGateSatisfied && creature?.manifest && (
        <form className="panel animation-create" onSubmit={create}>
          <div>
            <p className="eyebrow">New sequence</p>
            <h2>Start an animation</h2>
            <p>
              Canvas is frozen at {creature.manifest.canvasWidth} ×{" "}
              {creature.manifest.canvasHeight}; default swim planning uses eight
              frames.
            </p>
          </div>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            Type
            <select
              value={form.animationType}
              onChange={(event) =>
                setForm({ ...form, animationType: event.target.value })
              }
            >
              {animationTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Frames
            <input
              type="number"
              min="1"
              max="120"
              value={form.expectedFrameCount}
              onChange={(event) =>
                setForm({
                  ...form,
                  expectedFrameCount: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            FPS
            <input
              type="number"
              min="1"
              max="60"
              value={form.fps}
              onChange={(event) =>
                setForm({ ...form, fps: Number(event.target.value) })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={form.looping}
              onChange={(event) =>
                setForm({ ...form, looping: event.target.checked })
              }
            />
            Loop playback
          </label>
          <button className="button primary" disabled={working}>
            <Plus size={17} />{" "}
            {working ? "Creating…" : "Create and save key-pose prompt"}
          </button>
        </form>
      )}
      <section className="animation-card-grid">
        {animations.map((animation) => (
          <Link
            className="panel animation-card"
            key={animation.id}
            to={`/creatures/${creatureId}/animations/${animation.id}`}
          >
            <div className="animation-card-preview checkerboard">
              {animation.frames[0] ? (
                <img src={animation.frames[0].thumbnailUrl} alt="" />
              ) : (
                <Layers3 size={30} />
              )}
            </div>
            <div>
              <span
                className={`status-badge ${animation.status === "APPROVED" ? "success" : ""}`}
              >
                {label(animation.status)}
              </span>
              <h2>{animation.name}</h2>
              <p>
                {label(animation.animationType)} · {animation.frames.length}/
                {animation.expectedFrameCount} frames
              </p>
            </div>
          </Link>
        ))}
        {animations.length === 0 && (
          <div className="panel empty-state compact">
            <Layers3 size={30} />
            <h2>No animations yet</h2>
            <p>The first saved sequence will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function FrameEditor({
  frame,
  onSave,
  onDelete,
  onRepairPrompt,
  onReplace,
}: {
  frame: AnimationFrame;
  onSave: (
    value: Pick<
      AnimationFrame,
      "frameRole" | "durationMs" | "notes" | "markedForRepair"
    >,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
  onRepairPrompt: (instructions: string) => Promise<void>;
  onReplace: (file: File, notes: string) => Promise<void>;
}) {
  const [role, setRole] = useState(frame.frameRole);
  const [duration, setDuration] = useState(frame.durationMs);
  const [notes, setNotes] = useState(frame.notes);
  const [repair, setRepair] = useState(frame.markedForRepair);
  const [instructions, setInstructions] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setRole(frame.frameRole);
    setDuration(frame.durationMs);
    setNotes(frame.notes);
    setRepair(frame.markedForRepair);
    setInstructions("");
    setReplacement(null);
  }, [frame]);

  return (
    <aside className="panel frame-inspector">
      <div className="inspector-heading">
        <div>
          <p className="eyebrow">Selected frame</p>
          <h2>Frame {frame.frameNumber}</h2>
        </div>
        <span
          className={`status-badge ${frame.validationStatus === "VALID" ? "success" : "warning"}`}
        >
          {label(frame.validationStatus)}
        </span>
      </div>
      <label>
        Role
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as FrameRole)}
        >
          {frameRoles.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Duration (ms)
        <input
          type="number"
          min="1"
          max="60000"
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
      </label>
      <label>
        Review notes
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={repair}
          onChange={(event) => setRepair(event.target.checked)}
        />
        Mark for repair
      </label>
      <button
        className="button secondary"
        disabled={working}
        onClick={() =>
          void onSave({
            frameRole: role,
            durationMs: duration,
            notes,
            markedForRepair: repair,
          })
        }
      >
        <Save size={16} /> Save frame review
      </button>
      <dl className="frame-metrics">
        <div>
          <dt>Bounds</dt>
          <dd>
            {frame.boundingBox.width} × {frame.boundingBox.height} at{" "}
            {frame.boundingBox.x},{frame.boundingBox.y}
          </dd>
        </div>
        <div>
          <dt>Center</dt>
          <dd>
            {frame.center.x.toFixed(1)}, {frame.center.y.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt>Visible pixels</dt>
          <dd>{frame.opaquePixelCount.toLocaleString()}</dd>
        </div>
      </dl>
      {frame.validationMessages.length > 0 && (
        <div className="frame-warnings">
          <FileWarning size={17} />
          <div>
            {frame.validationMessages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        </div>
      )}
      {repair && (
        <div className="repair-panel">
          <h3>Non-destructive repair</h3>
          <textarea
            aria-label="Repair instructions"
            rows={3}
            placeholder="Describe only the defect to repair…"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <button
            className="button secondary"
            disabled={!instructions.trim()}
            onClick={() => void onRepairPrompt(instructions)}
          >
            <Clipboard size={16} /> Save repair prompt
          </button>
          <label className="replacement-picker">
            <RefreshCw size={16} />{" "}
            {replacement?.name || "Choose replacement PNG"}
            <input
              type="file"
              accept="image/png,.png"
              onChange={(event) =>
                setReplacement(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <button
            className="button primary"
            disabled={!replacement || working}
            onClick={() => {
              if (!replacement) return;
              setWorking(true);
              void onReplace(replacement, notes).finally(() =>
                setWorking(false),
              );
            }}
          >
            Replace while preserving original
          </button>
        </div>
      )}
      {!confirmDelete ? (
        <button
          className="button danger ghost-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={16} /> Remove frame
        </button>
      ) : (
        <div className="inline-confirm">
          <span>Remove it from playback? Original files stay in history.</span>
          <button
            className="button secondary"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button className="button danger" onClick={() => void onDelete()}>
            <Trash2 size={16} /> Confirm
          </button>
        </div>
      )}
    </aside>
  );
}

export function AnimationLabPage() {
  const { animationId = "" } = useParams();
  const [animation, setAnimation] = useState<Animation | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [onionPrevious, setOnionPrevious] = useState(false);
  const [onionNext, setOnionNext] = useState(false);
  const [onionOpacity, setOnionOpacity] = useState(0.28);
  const [showBounds, setShowBounds] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const [showAnchor, setShowAnchor] = useState(true);
  const [showLock, setShowLock] = useState(false);
  const [lockOpacity, setLockOpacity] = useState(0.22);
  const [importRole, setImportRole] = useState<FrameRole>("KEY_POSE");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const value = await api<Animation>(`/api/animations/${animationId}`);
      setAnimation(value);
      setSelected((current) =>
        Math.min(current, Math.max(0, value.frames.length - 1)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load animation.",
      );
    }
  }, [animationId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!playing || !animation || animation.frames.length === 0) return;
    const current = animation.frames[selected];
    const delay = Math.max(
      16,
      (current?.durationMs ?? 1000 / animation.fps) / speed,
    );
    const timer = window.setTimeout(() => {
      setSelected((index) => {
        if (index < animation.frames.length - 1) return index + 1;
        if (animation.looping) return 0;
        setPlaying(false);
        return index;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, selected, speed, animation]);

  const importFiles = useCallback(
    async (files: FileList | File[], source = "MANUAL") => {
      if (!animation || files.length === 0) return;
      setWorking(true);
      setError("");
      const body = new FormData();
      Array.from(files).forEach((file) => body.append("images", file));
      body.append("frameRole", importRole);
      body.append("source", source);
      body.append("actor", "LOCAL_USER");
      try {
        const updated = await api<Animation>(
          `/api/animations/${animation.id}/frames`,
          { method: "POST", body },
        );
        setAnimation(updated);
        setSelected(Math.max(0, updated.frames.length - files.length));
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Frame import failed.",
        );
      } finally {
        setWorking(false);
      }
    },
    [animation, importRole],
  );

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const images = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length) {
        event.preventDefault();
        void importFiles(images, "CLIPBOARD");
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [importFiles]);

  async function mutate<T = Animation>(
    url: string,
    init: RequestInit,
  ): Promise<T | null> {
    setWorking(true);
    setError("");
    try {
      const updated = await api<T>(url, init);
      if (updated && typeof updated === "object" && "frames" in updated)
        setAnimation(updated as unknown as Animation);
      return updated;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function move(index: number, offset: number) {
    if (!animation) return;
    const target = index + offset;
    if (target < 0 || target >= animation.frames.length) return;
    const ids = animation.frames.map((frame) => frame.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    const updated = await mutate<Animation>(
      `/api/animations/${animation.id}/frames/order`,
      jsonRequest("PATCH", { frameIds: ids, actor: "LOCAL_USER" }),
    );
    if (updated) setSelected(target);
  }

  async function saveSettings() {
    if (!animation) return;
    await mutate(
      `/api/animations/${animation.id}/settings`,
      jsonRequest("PATCH", {
        fps: animation.fps,
        looping: animation.looping,
        actor: "LOCAL_USER",
      }),
    );
  }

  const frame = animation?.frames[selected] ?? null;
  const prior =
    animation && selected > 0 ? animation.frames[selected - 1] : null;
  const next =
    animation && selected < animation.frames.length - 1
      ? animation.frames[selected + 1]
      : null;
  const latestPrompt = animation?.prompts[0] ?? null;

  async function copyPrompt() {
    if (!latestPrompt) return;
    try {
      await navigator.clipboard.writeText(latestPrompt.generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Clipboard access was blocked; copy the prompt manually.");
    }
  }

  if (!animation)
    return <div className="panel">{error || "Loading animation…"}</div>;
  return (
    <div className="page animation-lab-page">
      <LabHeader animation={animation} />
      {error && (
        <div className="error-panel">
          <AlertTriangle size={18} /> {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}
      {!animation.currentDesign && (
        <div className="reference-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Stale design lock</strong>
            <span>
              This animation remains in history but cannot be approved against a
              newer lock.
            </span>
          </div>
        </div>
      )}
      <div className="animation-toolbar panel">
        <div className="playback-controls">
          <button
            className="icon-button"
            aria-label="First frame"
            onClick={() => setSelected(0)}
          >
            <ChevronFirst size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Previous frame"
            onClick={() => setSelected(Math.max(0, selected - 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="button primary play-button"
            disabled={!frame}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            className="icon-button"
            aria-label="Next frame"
            onClick={() =>
              setSelected(Math.min(animation.frames.length - 1, selected + 1))
            }
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Last frame"
            onClick={() =>
              setSelected(Math.max(0, animation.frames.length - 1))
            }
          >
            <ChevronLast size={18} />
          </button>
        </div>
        <label>
          Speed
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 2].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <label>
          FPS
          <input
            type="number"
            min="1"
            max="60"
            value={animation.fps}
            onChange={(event) =>
              setAnimation({ ...animation, fps: Number(event.target.value) })
            }
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={animation.looping}
            onChange={(event) =>
              setAnimation({ ...animation, looping: event.target.checked })
            }
          />{" "}
          Loop
        </label>
        <button
          className="button secondary"
          onClick={() => void saveSettings()}
        >
          <Save size={15} /> Settings
        </button>
      </div>
      <div className="animation-workbench">
        <section className="panel animation-stage-panel">
          <div className="stage-tools">
            <label>
              <input
                type="checkbox"
                checked={onionPrevious}
                onChange={(event) => setOnionPrevious(event.target.checked)}
              />{" "}
              Previous onion
            </label>
            <label>
              <input
                type="checkbox"
                checked={onionNext}
                onChange={(event) => setOnionNext(event.target.checked)}
              />{" "}
              Next onion
            </label>
            <label>
              Onion{" "}
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={onionOpacity}
                onChange={(event) =>
                  setOnionOpacity(Number(event.target.value))
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={showLock}
                onChange={(event) => setShowLock(event.target.checked)}
              />{" "}
              Locked reference
            </label>
            {showLock && (
              <label>
                Reference{" "}
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={lockOpacity}
                  onChange={(event) =>
                    setLockOpacity(Number(event.target.value))
                  }
                />
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={showBounds}
                onChange={(event) => setShowBounds(event.target.checked)}
              />{" "}
              Bounds
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCenter}
                onChange={(event) => setShowCenter(event.target.checked)}
              />{" "}
              Center
            </label>
            <label>
              <input
                type="checkbox"
                checked={showAnchor}
                onChange={(event) => setShowAnchor(event.target.checked)}
              />{" "}
              Anchor
            </label>
          </div>
          <div
            className="animation-stage checkerboard"
            style={{
              aspectRatio: `${animation.canvasWidth}/${animation.canvasHeight}`,
            }}
          >
            {showLock && (
              <img
                className="stage-layer locked-layer"
                style={{ opacity: lockOpacity }}
                src={animation.lockedDesignUrl}
                alt="Locked design overlay"
              />
            )}
            {onionPrevious && prior && (
              <img
                className="stage-layer onion previous"
                style={{ opacity: onionOpacity }}
                src={prior.imageUrl}
                alt="Previous onion frame"
              />
            )}
            {onionNext && next && (
              <img
                className="stage-layer onion next"
                style={{ opacity: onionOpacity }}
                src={next.imageUrl}
                alt="Next onion frame"
              />
            )}
            {frame ? (
              <img
                className="stage-layer current-frame"
                src={frame.imageUrl}
                alt={`Frame ${frame.frameNumber}`}
              />
            ) : (
              <div className="stage-empty">
                <ImagePlus size={34} />
                <p>Import PNG frames to begin playback.</p>
              </div>
            )}
            {frame && showBounds && (
              <span
                className="bounds-overlay"
                style={{
                  left: `${(frame.boundingBox.x / animation.canvasWidth) * 100}%`,
                  top: `${(frame.boundingBox.y / animation.canvasHeight) * 100}%`,
                  width: `${(frame.boundingBox.width / animation.canvasWidth) * 100}%`,
                  height: `${(frame.boundingBox.height / animation.canvasHeight) * 100}%`,
                }}
              />
            )}
            {frame && showCenter && (
              <span
                className="point-overlay center-point"
                style={{
                  left: `${(frame.center.x / animation.canvasWidth) * 100}%`,
                  top: `${(frame.center.y / animation.canvasHeight) * 100}%`,
                }}
              />
            )}
            {showAnchor && (
              <span
                className="point-overlay anchor-point"
                style={{
                  left: `${(animation.anchor.x / animation.canvasWidth) * 100}%`,
                  top: `${(animation.anchor.y / animation.canvasHeight) * 100}%`,
                }}
              />
            )}
          </div>
        </section>
        {frame ? (
          <FrameEditor
            frame={frame}
            onSave={async (value) => {
              await mutate(
                `/api/animation-frames/${frame.id}`,
                jsonRequest("PATCH", { ...value, actor: "LOCAL_USER" }),
              );
            }}
            onDelete={async () => {
              await mutate(
                `/api/animation-frames/${frame.id}`,
                jsonRequest("DELETE", { confirmed: true }),
              );
            }}
            onRepairPrompt={async (repairInstructions) => {
              await mutate(
                `/api/animation-frames/${frame.id}/prompts/repair`,
                jsonRequest("POST", {
                  repairInstructions,
                  actor: "LOCAL_USER",
                }),
              );
            }}
            onReplace={async (file, notes) => {
              const body = new FormData();
              body.append("image", file);
              body.append("notes", notes);
              body.append("actor", "LOCAL_USER");
              await mutate(`/api/animation-frames/${frame.id}/replacement`, {
                method: "POST",
                body,
              });
            }}
          />
        ) : (
          <aside className="panel frame-inspector empty-state compact">
            <Eye size={28} />
            <h2>No frame selected</h2>
            <p>Import real PNG output below.</p>
          </aside>
        )}
      </div>
      <section className="panel frame-strip-panel">
        <div className="frame-strip-heading">
          <div>
            <p className="eyebrow">Playback order</p>
            <h2>Frame strip</h2>
          </div>
          <div className="frame-import-actions">
            <select
              aria-label="Imported frame role"
              value={importRole}
              onChange={(event) =>
                setImportRole(event.target.value as FrameRole)
              }
            >
              {frameRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/png,.png"
              multiple
              onChange={(event) =>
                event.target.files && void importFiles(event.target.files)
              }
            />
            <button
              className="button primary"
              disabled={working}
              onClick={() => fileInput.current?.click()}
            >
              <UploadCloud size={16} />{" "}
              {working ? "Saving…" : "Import PNG frames"}
            </button>
          </div>
        </div>
        <div
          className="frame-strip"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            void importFiles(event.dataTransfer.files);
          }}
        >
          {animation.frames.map((item, index) => (
            <article
              key={item.id}
              className={`frame-tile ${index === selected ? "selected" : ""} ${item.markedForRepair ? "repair" : ""}`}
              onClick={() => {
                setPlaying(false);
                setSelected(index);
              }}
            >
              <div className="frame-thumb checkerboard">
                <img
                  src={item.thumbnailUrl}
                  alt={`Frame ${item.frameNumber}`}
                />
                <span>{String(item.frameNumber).padStart(2, "0")}</span>
                {item.validationStatus !== "VALID" && (
                  <AlertTriangle size={14} />
                )}
              </div>
              <small>{label(item.frameRole)}</small>
              <div className="frame-order-buttons">
                <button
                  aria-label={`Move frame ${item.frameNumber} earlier`}
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void move(index, -1);
                  }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  aria-label={`Move frame ${item.frameNumber} later`}
                  disabled={index === animation.frames.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    void move(index, 1);
                  }}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </article>
          ))}
          {animation.frames.length === 0 && (
            <div className="frame-drop-empty">
              <UploadCloud size={24} />
              <span>
                Drop PNGs here, choose files, or paste from clipboard.
              </span>
            </div>
          )}
        </div>
      </section>
      <section className="animation-handoff-grid">
        <div className="panel prompt-panel animation-prompt-panel">
          <div className="prompt-toolbar">
            <div>
              <p className="eyebrow">ChatGPT handoff</p>
              <h2>
                {latestPrompt
                  ? `${label(latestPrompt.promptType)} prompt`
                  : "Prompt unavailable"}
              </h2>
            </div>
            {latestPrompt && (
              <button
                className="button secondary"
                onClick={() => void copyPrompt()}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy prompt"}
              </button>
            )}
          </div>
          {latestPrompt && (
            <pre tabIndex={0}>{latestPrompt.generatedPrompt}</pre>
          )}
          <button
            className="button secondary"
            disabled={
              animation.frames.filter((item) => item.frameRole === "KEY_POSE")
                .length < 2
            }
            onClick={() =>
              void mutate(
                `/api/animations/${animation.id}/prompts/intermediates`,
                jsonRequest("POST", { actor: "LOCAL_USER" }),
              )
            }
          >
            <Plus size={16} /> Save intermediate-frame prompt
          </button>
        </div>
        <div className="panel animation-approval">
          <ShieldCheck size={28} />
          <h2>Approve sequence</h2>
          <p>
            Approval requires exactly {animation.expectedFrameCount} active
            frames, the current design lock, all mandatory references, and no
            pending repairs.
          </p>
          <button
            className="button primary"
            disabled={working || animation.status === "APPROVED"}
            onClick={() =>
              void mutate(
                `/api/animations/${animation.id}/approve`,
                jsonRequest("POST", { confirmed: true, actor: "LOCAL_USER" }),
              )
            }
          >
            <ShieldCheck size={17} />{" "}
            {animation.status === "APPROVED"
              ? "Animation approved"
              : "Confirm animation approval"}
          </button>
        </div>
      </section>
    </div>
  );
}
