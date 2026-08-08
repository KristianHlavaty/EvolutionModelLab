import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  FileArchive,
  FileJson,
  FolderArchive,
  Image,
  PackageCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type { ExportRun, ValidationReport } from "./types.ts";

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function ExportConfirmation({
  report,
  includePrompts,
  working,
  onCancel,
  onConfirm,
}: {
  report: ValidationReport;
  includePrompts: boolean;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirmation-modal export-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-confirmation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Consequential filesystem action</p>
            <h2 id="export-confirmation-title">Create a versioned export</h2>
          </div>
          <button
            className="icon-button"
            onClick={onCancel}
            aria-label="Close export confirmation"
          >
            <X size={18} />
          </button>
        </div>
        <p>
          Evolution Model Lab will create a new directory under the configured
          export root. It will never replace an earlier package.
        </p>
        <div className="export-confirm-grid">
          <span>
            <strong>{report.approvedAnimationCount}</strong> approved animation
            {report.approvedAnimationCount === 1 ? "" : "s"}
          </span>
          <span>
            <strong>{report.referencesApproved}</strong> canonical references
          </span>
          <span>
            <strong>{report.warningCount}</strong> recorded warnings
          </span>
          <span>
            <strong>{includePrompts ? "Included" : "Excluded"}</strong> prompt
            history
          </span>
        </div>
        {report.warningCount > 0 && (
          <div className="reference-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Warnings will be exported, not hidden</strong>
              <span>
                Heuristic warnings do not block an explicitly approved
                animation.
              </span>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button primary"
            data-testid="confirm-export"
            disabled={working}
            onClick={onConfirm}
          >
            <PackageCheck size={17} />{" "}
            {working ? "Writing package…" : "Confirm new export version"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ExportPage() {
  const { creatureId = "" } = useParams();
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [exports, setExports] = useState<ExportRun[]>([]);
  const [includePrompts, setIncludePrompts] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [validation, runs] = await Promise.all([
        api<ValidationReport>(`/api/creatures/${creatureId}/validation-report`),
        api<ExportRun[]>(`/api/creatures/${creatureId}/exports`),
      ]);
      setReport(validation);
      setExports(runs);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load export readiness.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatureId]);

  useEffect(() => void load(), [load]);

  async function createExport() {
    setWorking(true);
    setError("");
    try {
      await api<ExportRun>(
        `/api/creatures/${creatureId}/exports`,
        jsonRequest("POST", {
          exportFormat: "GENERIC",
          includePromptHistory: includePrompts,
          confirmed: true,
          actor: "LOCAL_USER",
        }),
      );
      setConfirming(false);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Export failed without being saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setError(
        "Clipboard access was blocked. Select the package path manually.",
      );
    }
  }

  if (loading)
    return <div className="panel">Calculating export readiness…</div>;
  return (
    <div className="page export-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone 7 · generic game package</p>
          <h1>{report?.creatureName ?? "Creature"} export</h1>
          <p>
            Review persisted validation, then create a new non-overwriting
            package.
          </p>
        </div>
        <Link className="button secondary" to={`/creatures/${creatureId}`}>
          <ArrowLeft size={16} /> Creature
        </Link>
      </header>
      {error && (
        <div className="error-panel">
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {report && (
        <>
          <section
            className={`panel export-readiness ${report.readyForExport ? "ready" : "blocked"}`}
          >
            {report.readyForExport ? (
              <CheckCircle2 size={28} />
            ) : (
              <ShieldAlert size={28} />
            )}
            <div>
              <p className="eyebrow">Validation report</p>
              <h2>
                {report.readyForExport
                  ? "Ready for generic export"
                  : "Export gates remain"}
              </h2>
              <p>
                {report.readyForExport
                  ? "The current design, mandatory references, and an approved animation are present."
                  : "Resolve every blocking issue before creating a package."}
              </p>
            </div>
            <div className="readiness-stats">
              <span>
                <strong>{report.referencesApproved}</strong> references
              </span>
              <span>
                <strong>{report.approvedAnimationCount}</strong> approved
                animations
              </span>
              <span className={report.warningCount ? "has-warning" : ""}>
                <strong>{report.warningCount}</strong> warnings
              </span>
            </div>
          </section>
          {report.blockingIssues.length > 0 && (
            <section className="panel blocking-list">
              <h2>Blocking issues</h2>
              {report.blockingIssues.map((issue) => (
                <div key={issue}>
                  <X size={16} /> {issue}
                </div>
              ))}
            </section>
          )}
          <section className="validation-animation-grid">
            {report.animations.map((animation) => (
              <article
                className="panel validation-animation"
                key={animation.id}
              >
                <div className="validation-animation-heading">
                  <div>
                    <span
                      className={`status-badge ${animation.status === "APPROVED" || animation.status === "EXPORTED" ? "success" : ""}`}
                    >
                      {label(animation.status)}
                    </span>
                    <h2>{animation.name}</h2>
                    <p>{label(animation.animationType)}</p>
                  </div>
                  <Link
                    className="button secondary"
                    to={`/creatures/${creatureId}/animations/${animation.id}`}
                  >
                    Review frames
                  </Link>
                </div>
                <div className="validation-stats">
                  <span>
                    <strong>
                      {animation.activeFrameCount}/
                      {animation.expectedFrameCount}
                    </strong>{" "}
                    frames
                  </span>
                  <span>
                    <strong>{animation.warningFrameCount}</strong> warning
                    frames
                  </span>
                  <span>
                    <strong>{animation.pendingRepairCount}</strong> pending
                    repairs
                  </span>
                </div>
                {animation.messages.length > 0 && (
                  <details>
                    <summary>Frame warnings</summary>
                    <div className="validation-message-list">
                      {animation.messages.map((item) => (
                        <div key={item.frameId}>
                          <strong>Frame {item.frameNumber}</strong>
                          {item.messages.map((message) => (
                            <span key={message}>{message}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </section>
          <section className="panel export-action-panel">
            <div>
              <p className="eyebrow">Generic adapter</p>
              <h2>Create the next version</h2>
              <p>
                Includes the locked PNG, approved references, numbered
                originals, sprite sheets, JSON metadata, evolution, validation,
                and summary.
              </p>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={includePrompts}
                onChange={(event) => setIncludePrompts(event.target.checked)}
              />{" "}
              Include prompt history
            </label>
            <button
              className="button primary"
              disabled={!report.readyForExport || working}
              onClick={() => setConfirming(true)}
            >
              <FolderArchive size={17} /> Review new export
            </button>
          </section>
        </>
      )}
      <section className="export-history">
        <div className="section-title">
          <div>
            <p className="eyebrow">Immutable packages</p>
            <h2>Export history</h2>
          </div>
        </div>
        {exports.length === 0 ? (
          <div className="panel empty-state compact">
            <FileArchive size={30} />
            <h3>No exports yet</h3>
            <p>Completed package versions will remain listed here.</p>
          </div>
        ) : (
          exports.map((run) => (
            <article
              className="panel export-run"
              key={run.id}
              data-testid={`export-v${run.version}`}
            >
              <div className="export-run-heading">
                <div>
                  <span className="status-badge success">
                    {label(run.status)}
                  </span>
                  <h2>Export v{String(run.version).padStart(3, "0")}</h2>
                  <p>{new Date(run.createdAt).toLocaleString()}</p>
                </div>
                <div className="export-run-counts">
                  <span>
                    <Image size={15} /> {run.summary.referenceCount} references
                  </span>
                  <span>
                    <Clipboard size={15} /> {run.summary.animationCount}{" "}
                    animations
                  </span>
                  <span>
                    <FileJson size={15} /> {run.summary.frameCount} frames
                  </span>
                </div>
              </div>
              <div className="package-path">
                <code>{run.packagePath}</code>
                <button
                  className="icon-button"
                  aria-label={`Copy export v${run.version} path`}
                  onClick={() => void copyPath(run.packagePath)}
                >
                  {copied === run.packagePath ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>
              <details>
                <summary>{run.summary.files.length} packaged files</summary>
                <div className="export-file-list">
                  {run.summary.files.map((file) => (
                    <code key={file}>{file}</code>
                  ))}
                </div>
              </details>
            </article>
          ))
        )}
      </section>
      {confirming && report && (
        <ExportConfirmation
          report={report}
          includePrompts={includePrompts}
          working={working}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void createExport()}
        />
      )}
    </div>
  );
}
