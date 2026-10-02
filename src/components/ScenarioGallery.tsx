const scenarios = [
  { id: "rag", title: "RAG Agent", detail: "Retrieval → LLM → tool → completed" },
  { id: "recovery", title: "Tool Failure + Recovery", detail: "Failed call → fallback tool → completed" },
  { id: "latency", title: "Latency Heavy Run", detail: "Long LLM stage with a before/after comparison" },
] as const;

export default function ScenarioGallery({ onLoad }: { onLoad: (scenario: typeof scenarios[number]["id"]) => void }) {
  return <section className="panel scenario-gallery" aria-labelledby="scenario-heading">
    <div className="section-heading"><div><p className="eyebrow">Deterministic local fixtures</p><h2 id="scenario-heading">Demo scenarios</h2></div></div>
    <div className="scenario-grid">{scenarios.map((scenario) => <article className="scenario-card" key={scenario.id}>
      <div><h3>{scenario.title}</h3><p>{scenario.detail}</p></div>
      <button className="button button-quiet" type="button" onClick={() => onLoad(scenario.id)}>Load scenario</button>
    </article>)}</div>
  </section>;
}
