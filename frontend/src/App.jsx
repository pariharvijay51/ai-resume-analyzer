import { useEffect, useState } from "react";

const scoreColor = (s) => (s >= 75 ? "var(--good)" : s >= 50 ? "var(--mid)" : "var(--bad)");

function Score({ value, verdict }) {
  const r = 54, c = 2 * Math.PI * r;
  return (
    <div className="score">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={scoreColor(value)} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 70 70)" />
        <text x="70" y="78" textAnchor="middle" className="score-num">{value}%</text>
      </svg>
      <div className="verdict">{verdict}</div>
    </div>
  );
}

function Results({ d }) {
  const [tab, setTab] = useState("All");
  const qs = d.interviewQuestions || [];
  const cats = ["All", ...new Set(qs.map((x) => x.category))];
  return (
    <section className="results">
      <div className="panel top">
        <Score value={d.matchScore} verdict={d.verdict} />
        <div>
          <h2>{d.jobTitle}</h2>
          <p className="muted">{d.fileName} · {d.matchedSkills.length} of {d.matchedSkills.length + d.missingSkills.length} required skills matched</p>
          <div className="sections">
            {Object.entries(d.sections || {}).map(([k, v]) => (
              <span key={k} className={v ? "chip ok" : "chip no"}>{v ? "✓" : "✗"} {k}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="two">
        <div className="panel"><h3>Matched skills</h3>
          <div className="chips">{d.matchedSkills.map((s) => <span key={s} className="chip ok">✓ {s}</span>)}</div></div>
        <div className="panel"><h3>Missing skills</h3>
          <div className="chips">{d.missingSkills.length ? d.missingSkills.map((s) => <span key={s} className="chip no">✗ {s}</span>) : <span className="muted">Nothing missing.</span>}</div></div>
      </div>

      <div className="panel"><h3>How to improve your resume</h3>
        <ul>{d.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>

      <div className="panel"><h3>Interview questions</h3>
        <div className="tabs">{cats.map((c) => <button key={c} className={tab === c ? "tab on" : "tab"} onClick={() => setTab(c)}>{c}</button>)}</div>
        <ol>{qs.filter((x) => tab === "All" || x.category === tab).map((x, i) => (
          <li key={i}>{x.question} <span className={"diff " + x.difficulty}>{x.difficulty}</span></li>))}</ol>
      </div>
    </section>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [drag, setDrag] = useState(false);

  const loadHistory = () => fetch("/api/history").then((r) => r.json()).then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  async function analyze() {
    setErr("");
    if (!file) return setErr("Upload your resume as a PDF first.");
    if (jd.trim().length < 30) return setErr("Paste the full job description.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("resume", file); fd.append("jobTitle", title || "Untitled role"); fd.append("jobDescription", jd);
      const r = await fetch("/api/analyze", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); loadHistory();
      setTimeout(() => window.scrollTo({ top: 620, behavior: "smooth" }), 100);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const openOld = (id) => fetch("/api/analysis/" + id).then((r) => r.json()).then(setData);

  return (
    <main>
      <header>
        <h1>Does your resume fit the job?</h1>
        <p className="muted">Upload a resume, paste a job description, and see your match score, missing skills and likely interview questions.</p>
      </header>

      <div className="panel form">
        <label className={"drop" + (drag ? " over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]); }}>
          <input type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files[0])} />
          {file ? <strong>{file.name}</strong> : <span>Drag and drop your resume PDF here, or click to browse</span>}
        </label>
        <input className="field" placeholder="Job title (e.g. Software Engineer)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="field" rows="9" placeholder="Paste the job description here…" value={jd} onChange={(e) => setJd(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <button className="go" onClick={analyze} disabled={busy}>{busy ? "Analyzing… this takes about 10 seconds" : "Analyze resume"}</button>
      </div>

      {data && <Results d={data} />}

      <section className="panel history">
        <h3>Previous analyses</h3>
        {history.length === 0 ? <p className="muted">Your analyses will appear here.</p> :
          history.map((h) => (
            <button key={h.id} className="row" onClick={() => openOld(h.id)}>
              <span>{h.title}<small> {h.file_name}</small></span>
              <b style={{ color: scoreColor(h.match_score) }}>{h.match_score}%</b>
            </button>))}
      </section>
    </main>
  );
}
