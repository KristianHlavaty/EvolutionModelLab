import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FileClock,
  History,
  LockKeyhole,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type {
  Creature,
  DesignHistoryEvent,
  DesignManifest,
  DesignManifestField,
} from "./types.ts";

type FeatureField =
  "immutableFeatures" | "preferredFeatures" | "forbiddenFeatures";

const noteFields: Array<{
  field: Exclude<
    DesignManifestField,
    | FeatureField
    | "canvasWidth"
    | "canvasHeight"
    | "facing"
    | "anchorX"
    | "anchorY"
    | "transparentBackgroundRequired"
  >;
  label: string;
  help: string;
}> = [
  {
    field: "anatomyNotes",
    label: "Anatomy notes",
    help: "Only anatomy the project owner has explicitly approved.",
  },
  {
    field: "biologicalNotes",
    label: "Biological notes",
    help: "Leave blank when biology has not been established.",
  },
  {
    field: "styleNotes",
    label: "Style notes",
    help: "Visual language and rendering intent.",
  },
  {
    field: "paletteNotes",
    label: "Palette notes",
    help: "Approved colour relationships.",
  },
  {
    field: "textureNotes",
    label: "Texture notes",
    help: "Surface and material treatment.",
  },
  {
    field: "cameraNotes",
    label: "Camera notes",
    help: "Framing and projection requirements.",
  },
  {
    field: "lightingNotes",
    label: "Lighting notes",
    help: "Lighting consistency requirements.",
  },
  {
    field: "animationNotes",
    label: "Animation notes",
    help: "Design constraints only; animation work remains deferred.",
  },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="error-panel" role="alert">
      <ShieldAlert size={19} /> <span>{children}</span>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2 id="confirmation-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close confirmation"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FieldState({
  manifest,
  field,
}: {
  manifest: DesignManifest;
  field: DesignManifestField;
}) {
  return manifest.explicitFields.includes(field) ? (
    <span className="field-state explicit">Explicit</span>
  ) : (
    <span className="field-state default">Project default</span>
  );
}

function FeatureListEditor({
  field,
  label,
  description,
  manifest,
  onChange,
}: {
  field: FeatureField;
  label: string;
  description: string;
  manifest: DesignManifest;
  onChange: (field: FeatureField, value: string[]) => void;
}) {
  const values = manifest[field];
  function update(index: number, value: string) {
    onChange(
      field,
      values.map((entry, entryIndex) => (entryIndex === index ? value : entry)),
    );
  }
  function move(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= values.length) return;
    const next = [...values];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    onChange(field, next);
  }
  return (
    <section className="manifest-list-block">
      <div className="manifest-field-heading">
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <FieldState manifest={manifest} field={field} />
      </div>
      <div className="repeatable-list">
        {values.length === 0 && (
          <p className="empty-list">No approved entries.</p>
        )}
        {values.map((value, index) => (
          <div className="repeatable-row" key={`${field}-${index}`}>
            <span className="list-index">{index + 1}</span>
            <input
              value={value}
              aria-label={`${label} entry ${index + 1}`}
              onChange={(event) => update(index, event.target.value)}
              placeholder="Enter one specific feature"
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move ${label} entry ${index + 1} up`}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => move(index, 1)}
              disabled={index === values.length - 1}
              aria-label={`Move ${label} entry ${index + 1} down`}
            >
              <ArrowDown size={16} />
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() =>
                onChange(
                  field,
                  values.filter((_, entryIndex) => entryIndex !== index),
                )
              }
              aria-label={`Remove ${label} entry ${index + 1}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button secondary compact"
        onClick={() => onChange(field, [...values, ""])}
      >
        <Plus size={15} /> Add entry
      </button>
    </section>
  );
}

function manifestPayload(
  manifest: DesignManifest,
  confirmedLockedMismatch: boolean,
) {
  return {
    immutableFeatures: manifest.immutableFeatures,
    preferredFeatures: manifest.preferredFeatures,
    forbiddenFeatures: manifest.forbiddenFeatures,
    anatomyNotes: manifest.anatomyNotes,
    biologicalNotes: manifest.biologicalNotes,
    styleNotes: manifest.styleNotes,
    paletteNotes: manifest.paletteNotes,
    textureNotes: manifest.textureNotes,
    cameraNotes: manifest.cameraNotes,
    lightingNotes: manifest.lightingNotes,
    animationNotes: manifest.animationNotes,
    canvasWidth: manifest.canvasWidth,
    canvasHeight: manifest.canvasHeight,
    facing: manifest.facing,
    anchorX: manifest.anchorX,
    anchorY: manifest.anchorY,
    transparentBackgroundRequired: manifest.transparentBackgroundRequired,
    explicitFields: manifest.explicitFields,
    confirmedLockedMismatch,
    actor: "LOCAL_USER",
  };
}

export function ManifestPage() {
  const { creatureId = "" } = useParams();
  const [creature, setCreature] = useState<Creature | null>(null);
  const [saved, setSaved] = useState<DesignManifest | null>(null);
  const [draft, setDraft] = useState<DesignManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [showMismatchWarning, setShowMismatchWarning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCreature, manifest] = await Promise.all([
        api<Creature>(`/api/creatures/${creatureId}`),
        api<DesignManifest>(`/api/creatures/${creatureId}/manifest`),
      ]);
      setCreature(nextCreature);
      setSaved(manifest);
      setDraft(manifest);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Manifest could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatureId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unsaved = useMemo(
    () =>
      Boolean(
        saved &&
        draft &&
        JSON.stringify(manifestPayload(saved, false)) !==
          JSON.stringify(manifestPayload(draft, false)),
      ),
    [draft, saved],
  );

  function update<K extends DesignManifestField>(
    field: K,
    value: DesignManifest[K],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
            explicitFields: current.explicitFields.includes(field)
              ? current.explicitFields
              : [...current.explicitFields, field],
          }
        : current,
    );
    setResult("");
  }

  async function persist(confirmedLockedMismatch: boolean) {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const next = await api<DesignManifest>(
        `/api/creatures/${creatureId}/manifest`,
        jsonRequest("PATCH", manifestPayload(draft, confirmedLockedMismatch)),
      );
      setSaved(next);
      setDraft(next);
      setResult(`Manifest saved at version ${next.version}.`);
      setShowMismatchWarning(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Manifest was not saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !unsaved) return;
    const blankFeature = [
      ...draft.immutableFeatures,
      ...draft.preferredFeatures,
      ...draft.forbiddenFeatures,
    ].some((item) => item.trim().length === 0);
    if (blankFeature) {
      setError("Complete or remove empty feature entries before saving.");
      return;
    }
    if (
      draft.anchorX >= draft.canvasWidth ||
      draft.anchorY >= draft.canvasHeight
    ) {
      setError("Anchor coordinates must remain inside the configured canvas.");
      return;
    }
    if (draft.lockedMismatchWarningRequired) setShowMismatchWarning(true);
    else void persist(false);
  }

  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Loading design manifest…
      </div>
    );
  if (error && !draft)
    return (
      <div className="page">
        <ErrorNotice>{error}</ErrorNotice>
      </div>
    );
  if (!draft || !creature) return null;

  return (
    <div className="page manifest-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Design identity</p>
          <h1>{creature.displayName} manifest</h1>
          <p>
            Editable intent is kept separate from every frozen design-lock
            snapshot.
          </p>
        </div>
        <div className="header-actions">
          <span className="version-badge">
            {draft.version === 0 ? "Draft v0" : `Version ${draft.version}`}
          </span>
          <Link className="button secondary" to={`/creatures/${creatureId}`}>
            <ArrowLeft size={16} /> Creature
          </Link>
        </div>
      </header>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {result && (
        <div className="success-panel" role="status">
          <Check size={18} /> {result}
        </div>
      )}
      {draft.lockedSnapshotVersion !== null && (
        <div className="locked-snapshot-note">
          <LockKeyhole size={18} />
          <span>
            Locked design uses frozen manifest version{" "}
            {draft.lockedSnapshotVersion}. Confirmed edits create a new version
            without altering that snapshot.
          </span>
        </div>
      )}
      <form onSubmit={submit}>
        <section className="panel manifest-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Ordered constraints</p>
              <h2>Creature features</h2>
            </div>
            <span
              className={
                unsaved ? "unsaved-indicator active" : "unsaved-indicator"
              }
            >
              {unsaved ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <FeatureListEditor
            field="immutableFeatures"
            label="Immutable features"
            description="Identity traits that must survive every later interpretation."
            manifest={draft}
            onChange={update}
          />
          <FeatureListEditor
            field="preferredFeatures"
            label="Preferred features"
            description="Desirable traits that may yield to stronger immutable constraints."
            manifest={draft}
            onChange={update}
          />
          <FeatureListEditor
            field="forbiddenFeatures"
            label="Forbidden features"
            description="Visual or biological outcomes that must never be introduced."
            manifest={draft}
            onChange={update}
          />
        </section>

        <section className="panel manifest-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Approved notes</p>
              <h2>Design vocabulary</h2>
            </div>
          </div>
          <div className="manifest-notes-grid">
            {noteFields.map(({ field, label, help }) => (
              <label key={field}>
                <span className="label-line">
                  <strong>{label}</strong>
                  <FieldState manifest={draft} field={field} />
                </span>
                <textarea
                  value={draft[field]}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={help}
                />
                <small>{help}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="panel manifest-section">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Production frame</p>
              <h2>Canvas and placement</h2>
            </div>
          </div>
          <div className="production-grid">
            <label>
              <span className="label-line">
                <strong>Canvas width</strong>
                <FieldState manifest={draft} field="canvasWidth" />
              </span>
              <input
                type="number"
                min="1"
                max="8192"
                value={draft.canvasWidth}
                onChange={(event) =>
                  update("canvasWidth", Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="label-line">
                <strong>Canvas height</strong>
                <FieldState manifest={draft} field="canvasHeight" />
              </span>
              <input
                type="number"
                min="1"
                max="8192"
                value={draft.canvasHeight}
                onChange={(event) =>
                  update("canvasHeight", Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="label-line">
                <strong>Anchor X</strong>
                <FieldState manifest={draft} field="anchorX" />
              </span>
              <input
                type="number"
                min="0"
                max={Math.max(0, draft.canvasWidth - 1)}
                value={draft.anchorX}
                onChange={(event) =>
                  update("anchorX", Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="label-line">
                <strong>Anchor Y</strong>
                <FieldState manifest={draft} field="anchorY" />
              </span>
              <input
                type="number"
                min="0"
                max={Math.max(0, draft.canvasHeight - 1)}
                value={draft.anchorY}
                onChange={(event) =>
                  update("anchorY", Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="label-line">
                <strong>Facing</strong>
                <FieldState manifest={draft} field="facing" />
              </span>
              <select
                value={draft.facing}
                onChange={(event) =>
                  update(
                    "facing",
                    event.target.value as DesignManifest["facing"],
                  )
                }
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="front">Front</option>
                <option value="back">Back</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.transparentBackgroundRequired}
                onChange={(event) =>
                  update("transparentBackgroundRequired", event.target.checked)
                }
              />
              <span>
                <span className="label-line">
                  <strong>Transparent background required</strong>
                  <FieldState
                    manifest={draft}
                    field="transparentBackgroundRequired"
                  />
                </span>
                <small>Preserves sprite-ready alpha expectations.</small>
              </span>
            </label>
          </div>
        </section>
        <div className="sticky-save-bar">
          <span>
            {unsaved
              ? "Review and save this manifest draft."
              : `Last saved ${formatDate(draft.updatedAt)}`}
          </span>
          <button
            className="button primary"
            type="submit"
            disabled={!unsaved || saving}
          >
            {saving ? <span className="spinner small" /> : <Save size={16} />}{" "}
            Save manifest
          </button>
        </div>
      </form>
      {showMismatchWarning && (
        <Modal
          title="Confirm a new manifest version"
          onClose={() => setShowMismatchWarning(false)}
        >
          <div className="warning-callout">
            <ShieldAlert size={21} />
            <p>
              The locked image remains tied to manifest version{" "}
              {draft.lockedSnapshotVersion}. These edits may no longer match it
              and will create a separate immutable manifest version.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setShowMismatchWarning(false)}
            >
              Keep editing
            </button>
            <button
              className="button danger"
              disabled={saving}
              onClick={() => void persist(true)}
            >
              Confirm and create new version
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CreatureDesignPanel({
  creature,
  onChanged,
}: {
  creature: Creature;
  onChanged: () => Promise<void> | void;
}) {
  const [dialog, setDialog] = useState<"lock" | "unlock" | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const manifest = creature.manifest;
  const selected = creature.selectedCandidate;
  const activeLock = creature.activeLock;

  async function lock() {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      await api(
        `/api/creatures/${creature.id}/design-lock`,
        jsonRequest("POST", {
          candidateId: selected.id,
          confirmed: true,
          actor: "LOCAL_USER",
        }),
      );
      setDialog(null);
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Design was not locked.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function unlock() {
    setWorking(true);
    setError("");
    try {
      await api(
        `/api/creatures/${creature.id}/design-unlock`,
        jsonRequest("POST", { confirmed: true, actor: "LOCAL_USER" }),
      );
      setDialog(null);
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Design was not unlocked.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="panel design-control-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Authoritative identity</p>
          <h2>{activeLock ? "Design locked" : "Design ready for review"}</h2>
        </div>
        {activeLock ? (
          <span className="locked-badge">
            <LockKeyhole size={15} /> Lock {activeLock.lockNumber}
          </span>
        ) : (
          <span className="draft-badge">Not locked</span>
        )}
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="design-control-grid">
        <div className="locked-design-preview checkerboard">
          {activeLock ? (
            <img
              src={`/api/creatures/${creature.id}/locked-design?at=${encodeURIComponent(activeLock.lockedAt)}`}
              alt={`Locked design for ${creature.displayName}`}
            />
          ) : selected ? (
            <img
              src={selected.imageUrl}
              alt={`Selected candidate ${selected.candidateNumber}`}
            />
          ) : (
            <div className="empty-specimen">
              <LockKeyhole size={32} />
              <strong>Select a candidate first</strong>
            </div>
          )}
        </div>
        <div className="design-control-copy">
          {activeLock ? (
            <>
              <h3>
                Candidate {activeLock.candidateNumber}, round{" "}
                {activeLock.roundNumber}
              </h3>
              <p>
                Frozen with manifest version {activeLock.manifestVersion}.
                Imports and later selections do not replace this reference.
              </p>
              <button
                className="button danger"
                onClick={() => setDialog("unlock")}
              >
                <UnlockKeyhole size={16} /> Unlock design…
              </button>
            </>
          ) : (
            <>
              <h3>
                {selected
                  ? `Candidate ${selected.candidateNumber} selected`
                  : "No selected candidate"}
              </h3>
              <p>
                {selected
                  ? "Review the manifest before making this image authoritative for future references and animation."
                  : "Choose exactly one candidate in the current round before opening the lock confirmation."}
              </p>
              <button
                className="button primary"
                disabled={!selected || !manifest}
                onClick={() => setDialog("lock")}
              >
                <LockKeyhole size={16} /> Review and lock design…
              </button>
            </>
          )}
          <div className="manifest-mini-summary">
            <span>
              Manifest{" "}
              {manifest?.version === 0
                ? "draft v0"
                : `v${manifest?.version ?? 0}`}
            </span>
            <span>{manifest?.immutableFeatures.length ?? 0} immutable</span>
            <span>{manifest?.forbiddenFeatures.length ?? 0} forbidden</span>
          </div>
          <div className="inline-links">
            <Link to={`/creatures/${creature.id}/manifest`}>Edit manifest</Link>
            <Link to={`/creatures/${creature.id}/history`}>
              View design history
            </Link>
          </div>
        </div>
      </div>
      {(creature.lockHistory?.length ?? 0) > 0 && (
        <div className="lock-history-strip">
          <strong>Previous design locks</strong>
          {creature.lockHistory?.map((lock) => (
            <span key={lock.id}>
              #{lock.lockNumber} · candidate {lock.candidateNumber} ·{" "}
              {humanize(lock.status)}
              {lock.archivedReferencePath ? " · archived" : ""}
            </span>
          ))}
        </div>
      )}
      {dialog === "lock" && selected && manifest && (
        <Modal
          title="Lock authoritative design"
          onClose={() => setDialog(null)}
        >
          <div className="lock-summary">
            <img
              className="lock-summary-image checkerboard"
              src={selected.imageUrl}
              alt={`Candidate ${selected.candidateNumber}`}
            />
            <div>
              <p className="eyebrow">{creature.displayName}</p>
              <h3>Candidate {selected.candidateNumber}</h3>
              <p>
                Source round {creature.currentRound?.roundNumber ?? "current"}
              </p>
            </div>
          </div>
          <dl className="confirmation-details">
            <div>
              <dt>Immutable features</dt>
              <dd>
                {manifest.immutableFeatures.length
                  ? manifest.immutableFeatures.join(" · ")
                  : "None approved"}
              </dd>
            </div>
            <div>
              <dt>Forbidden features</dt>
              <dd>
                {manifest.forbiddenFeatures.length
                  ? manifest.forbiddenFeatures.join(" · ")
                  : "None approved"}
              </dd>
            </div>
            <div>
              <dt>Canvas</dt>
              <dd>
                {manifest.canvasWidth} × {manifest.canvasHeight}, anchor{" "}
                {manifest.anchorX}/{manifest.anchorY}
              </dd>
            </div>
            <div>
              <dt>Facing</dt>
              <dd>{manifest.facing}</dd>
            </div>
            <div>
              <dt>Transparency</dt>
              <dd>
                {manifest.transparentBackgroundRequired
                  ? "Required"
                  : "Not required"}
              </dd>
            </div>
          </dl>
          <div className="warning-callout">
            <LockKeyhole size={21} />
            <p>
              This copies the unchanged PNG into the locked reference, freezes a
              versioned manifest snapshot, and protects the candidate and source
              round. Unlocking is required before another design can become
              authoritative.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Cancel
            </button>
            <button
              data-testid="confirm-design-lock"
              className="button primary"
              disabled={working}
              onClick={() => void lock()}
            >
              {working ? (
                <span className="spinner small" />
              ) : (
                <LockKeyhole size={16} />
              )}{" "}
              Lock as authoritative design
            </button>
          </div>
        </Modal>
      )}
      {dialog === "unlock" && activeLock && (
        <Modal
          title="Unlock authoritative design"
          onClose={() => setDialog(null)}
        >
          <div className="warning-callout">
            <UnlockKeyhole size={21} />
            <p>
              Future reference and animation consistency may be affected.
              Candidate {activeLock.candidateNumber}, its active copied
              reference, frozen manifest, and complete history will be
              preserved. The project returns to refinement.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Keep design locked
            </button>
            <button
              data-testid="confirm-design-unlock"
              className="button danger"
              disabled={working}
              onClick={() => void unlock()}
            >
              {working ? (
                <span className="spinner small" />
              ) : (
                <UnlockKeyhole size={16} />
              )}{" "}
              Confirm unlock
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function DesignHistoryPage() {
  const { creatureId = "" } = useParams();
  const [creature, setCreature] = useState<Creature | null>(null);
  const [events, setEvents] = useState<DesignHistoryEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([
      api<Creature>(`/api/creatures/${creatureId}`),
      api<DesignHistoryEvent[]>(`/api/creatures/${creatureId}/history`),
    ])
      .then(([nextCreature, nextEvents]) => {
        setCreature(nextCreature);
        setEvents(nextEvents);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "History could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, [creatureId]);
  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading immutable history…
      </div>
    );
  return (
    <div className="page history-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Immutable audit trail</p>
          <h1>{creature?.displayName ?? "Creature"} history</h1>
          <p>
            Manifest, lock, unlock, protected-operation, and earlier workflow
            events.
          </p>
        </div>
        <Link className="button secondary" to={`/creatures/${creatureId}`}>
          <ArrowLeft size={16} /> Creature
        </Link>
      </header>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="history-event-list">
        {events.map((event) => (
          <article className="panel history-event" key={event.id}>
            <div className="history-event-icon">
              <FileClock size={19} />
            </div>
            <div className="history-event-main">
              <div className="history-event-heading">
                <strong>{humanize(event.action)}</strong>
                <time>{formatDate(event.timestamp)}</time>
              </div>
              <div className="history-chips">
                <span>{event.creature.displayName}</span>
                {event.candidate && (
                  <span>Candidate {event.candidate.candidateNumber}</span>
                )}
                {event.round && <span>Round {event.round.roundNumber}</span>}
                {event.manifestVersion !== null && (
                  <span>Manifest v{event.manifestVersion}</span>
                )}
                {event.actor && <span>{humanize(event.actor)}</span>}
              </div>
              {Object.keys(event.details).length > 0 && (
                <pre>{JSON.stringify(event.details, null, 2)}</pre>
              )}
            </div>
          </article>
        ))}
        {events.length === 0 && (
          <div className="panel empty-inline">
            <History size={24} /> No history events recorded.
          </div>
        )}
      </div>
    </div>
  );
}
