import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  FileImage,
  ImagePlus,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type {
  CanonicalReference,
  ReferenceContext,
  ReferenceSettings,
  ReferenceType,
} from "./types.ts";

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function ApprovalModal({
  reference,
  working,
  onCancel,
  onApprove,
}: {
  reference: CanonicalReference;
  working: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirmation-modal reference-approval-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-approval-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2 id="reference-approval-title">Approve canonical reference</h2>
          <button
            className="icon-button"
            onClick={onCancel}
            aria-label="Close approval"
          >
            <X size={18} />
          </button>
        </div>
        {reference.imageUrl && (
          <img
            className="approval-reference-image checkerboard"
            src={reference.imageUrl}
            alt={reference.referenceLabel}
          />
        )}
        <h3>{reference.referenceLabel}</h3>
        <p>
          Confirm only after comparing anatomy, silhouette, scale, palette,
          materials, texture, and lighting with the locked design. Approval may
          satisfy an animation prerequisite for this exact design lock.
        </p>
        {reference.validation.warnings.length > 0 && (
          <div className="reference-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Validation warnings remain</strong>
              {reference.validation.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel}>
            Keep reviewing
          </button>
          <button
            className="button primary"
            data-testid="confirm-reference-approval"
            disabled={working}
            onClick={onApprove}
          >
            <ShieldCheck size={17} /> Confirm reference approval
          </button>
        </div>
      </section>
    </div>
  );
}

function ReferenceAttempt({
  reference,
  onChanged,
}: {
  reference: CanonicalReference;
  onChanged: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(reference.notes);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(reference.generatedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError("The browser did not allow prompt copying.");
    }
  }

  async function importImage() {
    if (!file) return;
    setWorking(true);
    setError("");
    const body = new FormData();
    body.append("image", file);
    body.append("notes", notes);
    body.append("actor", "LOCAL_USER");
    try {
      await api(`/api/references/${reference.id}/import`, {
        method: "POST",
        body,
      });
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reference import failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function approve() {
    setWorking(true);
    setError("");
    try {
      await api(
        `/api/references/${reference.id}/approve`,
        jsonRequest("POST", {
          confirmed: true,
          notes,
          actor: "LOCAL_USER",
        }),
      );
      setApprovalOpen(false);
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Reference approval failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <article
      className={`panel reference-attempt ${reference.approved ? "approved" : ""} ${!reference.currentDesign ? "stale" : ""}`}
      data-testid={`reference-${reference.referenceType.toLowerCase()}`}
    >
      <div className="reference-attempt-heading">
        <div>
          <p className="eyebrow">{reference.referenceType}</p>
          <h3>{reference.referenceLabel}</h3>
        </div>
        <div className="reference-badges">
          {!reference.currentDesign && <span>Older design lock</span>}
          <span
            className={`reference-state state-${reference.status.toLowerCase()}`}
          >
            {humanize(reference.status)}
          </span>
        </div>
      </div>
      {error && (
        <div className="error-panel compact-error" role="alert">
          {error}
        </div>
      )}
      <div className="reference-attempt-grid">
        <div className="reference-preview checkerboard">
          {reference.imageUrl ? (
            <img src={reference.imageUrl} alt={reference.referenceLabel} />
          ) : (
            <div>
              <FileImage size={34} />
              <span>Awaiting one PNG</span>
            </div>
          )}
        </div>
        <div className="reference-attempt-copy">
          <div className="reference-meta">
            <span>Design lock {reference.designLockId.slice(0, 8)}</span>
            {reference.width && reference.height && (
              <span>
                {reference.width} × {reference.height} px
              </span>
            )}
            {reference.originalFilename && (
              <span>{reference.originalFilename}</span>
            )}
          </div>
          <details className="reference-prompt">
            <summary>Saved generation prompt</summary>
            <div className="prompt-toolbar">
              <span>
                Attach the locked design in ChatGPT before using this.
              </span>
              <button
                className="button secondary compact"
                onClick={() => void copyPrompt()}
              >
                <Clipboard size={14} /> {copied ? "Copied" : "Copy prompt"}
              </button>
            </div>
            <pre>{reference.generatedPrompt}</pre>
          </details>
          {reference.status === "REQUESTED" && reference.currentDesign && (
            <div className="reference-import-form">
              <label>
                <span>Reference notes</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <label className="reference-file-picker">
                <ImagePlus size={18} />
                <span>{file ? file.name : "Choose one PNG"}</span>
                <input
                  type="file"
                  accept="image/png,.png"
                  aria-label={`Import ${reference.referenceLabel} PNG`}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <button
                className="button primary"
                disabled={!file || working}
                onClick={() => void importImage()}
              >
                <ImagePlus size={16} /> Import and validate
              </button>
            </div>
          )}
          {reference.status !== "REQUESTED" && (
            <div className="validation-summary">
              <div>
                <CheckCircle2 size={18} />
                <strong>PNG content validated</strong>
              </div>
              {reference.validation.warnings.map((warning) => (
                <span key={warning}>
                  <AlertTriangle size={14} /> {warning}
                </span>
              ))}
            </div>
          )}
          {reference.status === "IMPORTED" && reference.currentDesign && (
            <button
              className="button primary approve-reference"
              onClick={() => setApprovalOpen(true)}
            >
              <ShieldCheck size={16} /> Review and approve…
            </button>
          )}
          {reference.approved && (
            <div className="reference-approved-note">
              <Check size={17} /> Approved for this design lock
            </div>
          )}
        </div>
      </div>
      {approvalOpen && (
        <ApprovalModal
          reference={reference}
          working={working}
          onCancel={() => setApprovalOpen(false)}
          onApprove={() => void approve()}
        />
      )}
    </article>
  );
}

export function ReferencesPage() {
  const { creatureId = "" } = useParams();
  const [context, setContext] = useState<ReferenceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingType, setWorkingType] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContext(
        await api<ReferenceContext>(`/api/creatures/${creatureId}/references`),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "References failed to load.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatureId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(referenceType: string) {
    setWorkingType(referenceType);
    setError("");
    try {
      await api(
        `/api/creatures/${creatureId}/references`,
        jsonRequest("POST", {
          referenceType,
          notes: "",
          actor: "LOCAL_USER",
        }),
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Reference request was not created.",
      );
    } finally {
      setWorkingType(null);
    }
  }

  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading canonical references…
      </div>
    );
  if (!context)
    return <div className="error-panel">{error || "Creature not found."}</div>;

  return (
    <div className="page references-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone 5 · identity reference set</p>
          <h1>{context.creature.displayName} references</h1>
          <p>
            Request, import, validate, and explicitly approve one canonical view
            at a time against the active locked design.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button secondary" to="/settings">
            <Settings2 size={16} /> Mandatory rules
          </Link>
          <Link className="button secondary" to={`/creatures/${creatureId}`}>
            <ArrowLeft size={16} /> Creature
          </Link>
        </div>
      </header>
      {error && <div className="error-panel">{error}</div>}
      {!context.activeLock ? (
        <section className="panel reference-lock-gate">
          <LockKeyhole size={30} />
          <div>
            <h2>Lock the creature design first</h2>
            <p>
              Canonical references must be tied to one verified authoritative
              design. Selected or historical candidates cannot satisfy this
              gate.
            </p>
          </div>
          <Link className="button primary" to={`/creatures/${creatureId}`}>
            Review design
          </Link>
        </section>
      ) : (
        <>
          <section className="reference-overview-grid">
            <article className="panel locked-reference-card">
              <div className="reference-preview checkerboard">
                <img
                  src={context.activeLock.imageUrl}
                  alt={`${context.creature.displayName} locked design`}
                />
              </div>
              <div>
                <p className="eyebrow">Identity authority</p>
                <h2>Locked design</h2>
                <p>
                  Frozen manifest version {context.activeLock.manifestVersion}
                </p>
                <span className="reference-approved-note">
                  <Check size={16} /> Mandatory anchor satisfied
                </span>
              </div>
            </article>
            <article className="panel mandatory-progress">
              <p className="eyebrow">Animation prerequisite</p>
              <h2>
                {context.animationGateSatisfied
                  ? "Mandatory set approved"
                  : `${context.missingMandatoryReferenceTypes.length} required reference${context.missingMandatoryReferenceTypes.length === 1 ? "" : "s"} missing`}
              </h2>
              <div className="mandatory-reference-pills">
                {context.requiredReferenceTypes.map((referenceType) => {
                  const satisfied =
                    context.satisfiedReferenceTypes.includes(referenceType);
                  return (
                    <span
                      className={satisfied ? "satisfied" : "missing"}
                      key={referenceType}
                    >
                      {satisfied ? <Check size={13} /> : <span />}
                      {humanize(referenceType)}
                    </span>
                  );
                })}
              </div>
              <p>
                Project rules are checked against approvals belonging to this
                exact design lock. Older approvals stay visible but do not
                satisfy the gate.
              </p>
            </article>
          </section>
          <section className="panel reference-type-panel">
            <div className="section-title compact-title">
              <div>
                <p className="eyebrow">One view per request</p>
                <h2>Reference types</h2>
                <p>Choose only views that are useful for this creature.</p>
              </div>
              <Sparkles size={21} />
            </div>
            <div className="reference-type-grid">
              {context.availableReferenceTypes.map((item) => (
                <article key={item.type}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>
                      {item.mandatory ? "Mandatory" : "Optional"}
                      {item.latestStatus
                        ? ` · ${humanize(item.latestStatus)}`
                        : ""}
                    </span>
                  </div>
                  {item.approved ? (
                    <span className="reference-type-approved">
                      <Check size={15} /> Approved
                    </span>
                  ) : (
                    <button
                      className="button secondary compact"
                      disabled={
                        workingType === item.type ||
                        item.latestStatus === "REQUESTED"
                      }
                      onClick={() => void request(item.type)}
                    >
                      <Sparkles size={14} />
                      {item.latestStatus === "IMPORTED"
                        ? "New attempt"
                        : item.latestStatus === "REQUESTED"
                          ? "Awaiting import"
                          : "Create prompt"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="reference-attempts">
            <div className="section-title">
              <div>
                <p className="eyebrow">Immutable attempt history</p>
                <h2>Reference requests</h2>
              </div>
            </div>
            {context.references.length === 0 ? (
              <div className="panel empty-inline">
                No canonical reference requests yet.
              </div>
            ) : (
              context.references.map((reference) => (
                <ReferenceAttempt
                  key={reference.id}
                  reference={reference}
                  onChanged={load}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function ReferenceSettingsPage() {
  const [settings, setSettings] = useState<ReferenceSettings | null>(null);
  const [selected, setSelected] = useState<ReferenceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<ReferenceSettings>("/api/reference-settings")
      .then((value) => {
        setSettings(value);
        setSelected(value.requiredReferenceTypes);
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Settings failed to load.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function toggle(referenceType: ReferenceType) {
    if (referenceType === "LOCKED_DESIGN") return;
    setSelected((current) =>
      current.includes(referenceType)
        ? current.filter((item) => item !== referenceType)
        : [...current, referenceType],
    );
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await api<ReferenceSettings>(
        "/api/reference-settings",
        jsonRequest("PATCH", {
          requiredReferenceTypes: selected,
          actor: "LOCAL_USER",
        }),
      );
      setSettings(next);
      setSelected(next.requiredReferenceTypes);
      setMessage("Mandatory-reference rules saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Settings were not saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading project settings…
      </div>
    );
  if (!settings)
    return (
      <div className="error-panel">{error || "Settings unavailable."}</div>
    );

  return (
    <div className="page reference-settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Project-level gate</p>
          <h1>Mandatory references</h1>
          <p>
            Choose the approvals every locked creature must satisfy before
            Animation Lab can begin.
          </p>
        </div>
        <Link className="button secondary" to="/">
          <ArrowLeft size={16} /> Overview
        </Link>
      </header>
      {error && <div className="error-panel">{error}</div>}
      {message && (
        <div className="success-panel" role="status">
          <Check size={17} /> {message}
        </div>
      )}
      <section className="panel settings-reference-list">
        <div className="section-title compact-title">
          <div>
            <p className="eyebrow">Approval requirements</p>
            <h2>Canonical reference types</h2>
          </div>
          <Settings2 size={22} />
        </div>
        {settings.availableReferenceTypes.map((item) => {
          const locked = item.type === "LOCKED_DESIGN";
          const checked = selected.includes(item.type);
          return (
            <label key={item.type}>
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={() => toggle(item.type)}
              />
              <span>
                <strong>{item.label}</strong>
                <small>
                  {locked
                    ? "Always mandatory — every reference set needs an identity authority."
                    : checked
                      ? "Approval required before animation."
                      : "Optional for each creature."}
                </small>
              </span>
              {checked && <CheckCircle2 size={19} />}
            </label>
          );
        })}
        <div className="form-actions">
          <button
            className="button primary"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={16} /> Save mandatory rules
          </button>
        </div>
      </section>
    </div>
  );
}
