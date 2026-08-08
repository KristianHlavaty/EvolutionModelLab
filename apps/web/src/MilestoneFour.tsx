import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Dna,
  GitBranch,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, jsonRequest } from "./api.ts";
import type {
  Creature,
  EvolutionContext,
  EvolutionNode,
  EvolutionTree,
} from "./types.ts";

const mutationCategories = [
  "ANATOMY",
  "ARMOUR",
  "LOCOMOTION",
  "FEEDING",
  "SENSORY",
  "SIZE",
  "COLOUR",
  "HABITAT",
  "BEHAVIOUR",
  "OTHER",
] as const;

type MutationDraft = {
  key: string;
  category: (typeof mutationCategories)[number];
  description: string;
  intensity: number;
  inherited: boolean;
};

function mutationDraft(): MutationDraft {
  return {
    key: crypto.randomUUID(),
    category: "ANATOMY",
    description: "",
    intensity: 3,
    inherited: false,
  };
}

function title(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function EvolutionNodeCard({
  node,
  focused,
}: {
  node: EvolutionNode;
  focused: boolean;
}) {
  return (
    <Link
      className={`evolution-node ${focused ? "focused" : ""}`}
      to={`/creatures/${node.id}/evolution`}
      aria-current={focused ? "page" : undefined}
    >
      <div className="evolution-node-image checkerboard">
        {node.thumbnailUrl ? (
          <img src={node.thumbnailUrl} alt="" />
        ) : (
          <Dna size={25} />
        )}
        {node.locked && (
          <span className="evolution-lock" title="Design locked">
            <LockKeyhole size={13} />
          </span>
        )}
      </div>
      <div className="evolution-node-copy">
        <small>Generation {node.evolutionaryGeneration}</small>
        <strong>{node.displayName}</strong>
        <span>{node.scientificName || "Unclassified"}</span>
        <div>
          <span className={`status-pill status-${node.status.toLowerCase()}`}>
            {title(node.status)}
          </span>
          {node.childCount > 0 && (
            <em>
              {node.childCount} {node.childCount === 1 ? "child" : "children"}
            </em>
          )}
        </div>
      </div>
      <ChevronRight size={17} />
    </Link>
  );
}

function Tree({
  tree,
  focusedId,
}: {
  tree: EvolutionTree;
  focusedId?: string | undefined;
}) {
  const generations = useMemo(() => {
    const values = new Map<number, EvolutionNode[]>();
    for (const node of tree.nodes) {
      const bucket = values.get(node.evolutionaryGeneration) ?? [];
      bucket.push(node);
      values.set(node.evolutionaryGeneration, bucket);
    }
    return [...values.entries()].sort(([left], [right]) => left - right);
  }, [tree]);
  return (
    <section className="panel evolution-tree-panel">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Lineage map</p>
          <h2>Evolution tree</h2>
          <p>Every connection is stored independently of this visual layout.</p>
        </div>
        <GitBranch size={22} />
      </div>
      {tree.nodes.length === 0 ? (
        <div className="empty-inline">Create and lock a creature first.</div>
      ) : (
        <div className="evolution-generations">
          {generations.map(([generation, nodes]) => (
            <div className="evolution-generation" key={generation}>
              <div className="generation-label">
                <span>G{generation}</span>
                <small>
                  {generation === 0 ? "Origins" : `Generation ${generation}`}
                </small>
              </div>
              <div className="generation-nodes">
                {nodes.map((node) => (
                  <EvolutionNodeCard
                    key={node.id}
                    node={node}
                    focused={node.id === focusedId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TraitList({
  title: heading,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <div className="evolution-trait-list">
      <strong>{heading}</strong>
      {values.length > 0 ? (
        <ol>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ol>
      ) : (
        <span>None recorded in the approved ancestor manifest.</span>
      )}
    </div>
  );
}

function Comparison({ context }: { context: EvolutionContext }) {
  if (!context.comparison) return null;
  const { parent, child } = context.comparison;
  return (
    <section className="panel evolution-comparison">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Identity comparison</p>
          <h2>Ancestor and descendant</h2>
        </div>
        <ArrowLeftRight size={22} />
      </div>
      <div className="evolution-comparison-grid">
        {[parent, child].map((node, index) => (
          <article key={node.id}>
            <div className="comparison-image checkerboard">
              {node.imageUrl ? (
                <img
                  src={node.imageUrl}
                  alt={`${node.displayName} ${index === 0 ? "ancestor" : "descendant"}`}
                />
              ) : (
                <div className="empty-specimen">
                  <Dna size={32} />
                  <span>No selected design yet</span>
                </div>
              )}
            </div>
            <small>{index === 0 ? "Approved ancestor" : "Descendant"}</small>
            <h3>{node.displayName}</h3>
            <p>
              Generation {node.evolutionaryGeneration} · {title(node.status)}
            </p>
            <Link to={`/creatures/${node.id}`}>Open creature</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function DescendantForm({
  parent,
  onCreated,
}: {
  parent: EvolutionNode;
  onCreated: (creature: Creature) => void;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    scientificName: "",
    description: "",
    generationBrief: "",
  });
  const [mutations, setMutations] = useState<MutationDraft[]>([
    mutationDraft(),
  ]);

  function updateMutation(
    key: string,
    patch: Partial<Omit<MutationDraft, "key">>,
  ) {
    setMutations((current) =>
      current.map((mutation) =>
        mutation.key === key ? { ...mutation, ...patch } : mutation,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    setMutations((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const created = await api<Creature>(
        `/api/creatures/${parent.id}/descendants`,
        jsonRequest("POST", {
          ...form,
          mutations: mutations.map((mutation) => ({
            category: mutation.category,
            description: mutation.description,
            intensity: mutation.intensity,
            inherited: mutation.inherited,
          })),
          actor: "LOCAL_USER",
        }),
      );
      onCreated(created);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Descendant was not created.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (!open) {
    return (
      <section className="panel descendant-callout">
        <div>
          <p className="eyebrow">Next branch</p>
          <h2>Create a descendant from {parent.displayName}</h2>
          <p>
            The locked ancestor and its approved manifest become the immutable
            evolutionary reference. Only mutations entered here are requested.
          </p>
        </div>
        <button className="button primary" onClick={() => setOpen(true)}>
          <GitBranch size={17} /> Define descendant
        </button>
      </section>
    );
  }

  return (
    <form
      className="panel descendant-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Evolution branch</p>
          <h2>Define the descendant</h2>
          <p>Ancestor: {parent.displayName}</p>
        </div>
        <button
          className="button ghost"
          type="button"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      {error && <div className="error-panel compact-error">{error}</div>}
      <div className="field-grid">
        <label>
          <span>Display name</span>
          <input
            required
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>Scientific name</span>
          <input
            value={form.scientificName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                scientificName: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <label>
        <span>Description</span>
        <textarea
          rows={2}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </label>
      <label>
        <span>Descendant generation brief</span>
        <textarea
          required
          rows={5}
          value={form.generationBrief}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              generationBrief: event.target.value,
            }))
          }
          placeholder="Describe the descendant's ecological direction without restating unapproved anatomy."
        />
      </label>
      <div className="mutation-editor">
        <div className="mutation-heading">
          <div>
            <strong>Ordered mutations</strong>
            <span>Prompt priority follows this order.</span>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setMutations((current) => [...current, mutationDraft()])
            }
          >
            <Plus size={15} /> Add mutation
          </button>
        </div>
        {mutations.map((mutation, index) => (
          <div className="mutation-row" key={mutation.key}>
            <span className="mutation-index">{index + 1}</span>
            <label>
              Category
              <select
                value={mutation.category}
                onChange={(event) =>
                  updateMutation(mutation.key, {
                    category: event.target
                      .value as (typeof mutationCategories)[number],
                  })
                }
              >
                {mutationCategories.map((category) => (
                  <option key={category} value={category}>
                    {title(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mutation-description">
              Description
              <input
                required
                value={mutation.description}
                onChange={(event) =>
                  updateMutation(mutation.key, {
                    description: event.target.value,
                  })
                }
                placeholder="One controlled inherited adaptation or new change"
              />
            </label>
            <label>
              Intensity
              <select
                value={mutation.intensity}
                onChange={(event) =>
                  updateMutation(mutation.key, {
                    intensity: Number(event.target.value),
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}/5
                  </option>
                ))}
              </select>
            </label>
            <label className="mutation-check">
              <input
                type="checkbox"
                checked={mutation.inherited}
                onChange={(event) =>
                  updateMutation(mutation.key, {
                    inherited: event.target.checked,
                  })
                }
              />
              Inherited adaptation
            </label>
            <div className="mutation-actions">
              <button
                type="button"
                aria-label={`Move mutation ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                aria-label={`Move mutation ${index + 1} down`}
                disabled={index === mutations.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                aria-label={`Remove mutation ${index + 1}`}
                disabled={mutations.length === 1}
                onClick={() =>
                  setMutations((current) =>
                    current.filter((item) => item.key !== mutation.key),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button className="button primary" disabled={working}>
          {working ? (
            <span className="spinner small" />
          ) : (
            <GitBranch size={17} />
          )}
          Create evolution round
        </button>
      </div>
    </form>
  );
}

export function EvolutionPage() {
  const { creatureId } = useParams();
  const navigate = useNavigate();
  const [tree, setTree] = useState<EvolutionTree | null>(null);
  const [context, setContext] = useState<EvolutionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextTree, nextContext] = await Promise.all([
        api<EvolutionTree>("/api/evolution"),
        creatureId
          ? api<EvolutionContext>(`/api/creatures/${creatureId}/evolution`)
          : Promise.resolve(null),
      ]);
      setTree(nextTree);
      setContext(nextContext);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Evolution tree failed to load.",
      );
    } finally {
      setLoading(false);
    }
  }, [creatureId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="loading-panel">
        <span className="spinner" /> Reading evolutionary lineage…
      </div>
    );
  if (error || !tree)
    return (
      <div className="error-panel">{error || "Evolution tree not found."}</div>
    );

  return (
    <div className="page evolution-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone 4 · persisted lineage</p>
          <h1>
            {context
              ? `${context.creature.displayName} lineage`
              : "Evolution tree"}
          </h1>
          <p>
            Approved ancestors, inherited constraints, and ordered mutations
            stay connected to every descendant round.
          </p>
        </div>
        <div className="header-actions">
          {context && (
            <Link
              className="button secondary"
              to={`/creatures/${context.creature.id}`}
            >
              Creature
            </Link>
          )}
          <Link className="button secondary" to="/creatures">
            All creatures
          </Link>
        </div>
      </header>
      <Tree tree={tree} focusedId={creatureId} />
      {context && (
        <>
          {context.parent && (
            <section className="panel lineage-summary">
              <div>
                <small>Approved ancestor</small>
                <Link to={`/creatures/${context.parent.id}/evolution`}>
                  {context.parent.displayName}
                </Link>
              </div>
              <ChevronRight size={20} />
              <div>
                <small>
                  Generation {context.creature.evolutionaryGeneration}
                </small>
                <strong>{context.creature.displayName}</strong>
              </div>
              <span className="lineage-confirmed">
                <CheckCircle2 size={16} /> Persisted lineage
              </span>
            </section>
          )}
          <Comparison context={context} />
          {context.parent && (
            <section className="evolution-detail-grid">
              <div className="panel">
                <div className="section-title compact-title">
                  <div>
                    <p className="eyebrow">Ancestor contract</p>
                    <h2>Inherited design traits</h2>
                  </div>
                  <Dna size={21} />
                </div>
                <TraitList title="Immutable" values={context.inheritedTraits} />
                <TraitList title="Preferred" values={context.preferredTraits} />
                <TraitList title="Forbidden" values={context.forbiddenTraits} />
              </div>
              <div className="panel">
                <div className="section-title compact-title">
                  <div>
                    <p className="eyebrow">Stored changes</p>
                    <h2>Evolutionary mutations</h2>
                  </div>
                  <GitBranch size={21} />
                </div>
                <ol className="mutation-list">
                  {context.mutations.map((mutation) => (
                    <li key={mutation.id}>
                      <span>{mutation.category}</span>
                      <strong>{mutation.description}</strong>
                      <small>
                        Intensity {mutation.intensity ?? "not specified"}/5 ·{" "}
                        {mutation.inherited ? "Inherited" : "New mutation"}
                      </small>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
          {context.canCreateDescendant ? (
            <DescendantForm
              parent={context.creature}
              onCreated={(creature) =>
                navigate(`/creatures/${creature.id}/evolution`)
              }
            />
          ) : (
            <section className="panel descendant-gate">
              <LockKeyhole size={24} />
              <div>
                <h2>Lock this design before branching</h2>
                <p>
                  Evolution requires one active authoritative ancestor.
                  Historical or merely selected candidates cannot seed a
                  descendant.
                </p>
              </div>
              <Link
                className="button secondary"
                to={`/creatures/${context.creature.id}`}
              >
                Review design
              </Link>
            </section>
          )}
          {context.children.length > 0 && (
            <section className="panel descendant-list">
              <div className="section-title compact-title">
                <div>
                  <p className="eyebrow">Direct branches</p>
                  <h2>Descendants</h2>
                </div>
              </div>
              {context.children.map((child) => (
                <EvolutionNodeCard
                  key={child.id}
                  node={child}
                  focused={false}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
