export default function ScenarioBadge({ n, w, pop, lam, feasible }) {
  if (n == null) return <div className="scenario-badge">—</div>;
  return (
    <div className={`scenario-badge ${feasible === false ? 'infeasible' : ''}`}>
      <span>
        <em>N</em>={n}
      </span>
      <span className="sep">·</span>
      <span>
        <em>W</em>={Number(w).toFixed(2)}
      </span>
      <span className="sep">·</span>
      <span>
        <em>POP</em>={pop}%
      </span>
      <span className="sep">·</span>
      <span>
        <em>λ</em>={lam}
      </span>
      {feasible === false && <span className="badge-flag">Infeasible</span>}
    </div>
  );
}
