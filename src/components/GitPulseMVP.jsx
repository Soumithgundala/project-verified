import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, CheckCircle, Terminal, GitCommit, Fingerprint, Layers, Cpu, ArrowLeft, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import './GitPulseMVP.css'; // Import your new stylesheet

const GitPulseMVP = ({ linkedUrl, onReset }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const reportRef = useRef();

  useEffect(() => {
    const analyzeRepo = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/link-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: linkedUrl }),
        });
        const result = await response.json();
        if (result.success) setData(result);
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setLoading(false);
      }
    };

    if (linkedUrl) analyzeRepo();
  }, [linkedUrl]);

  const handleDownloadPDF = () => {
    setIsPrinting(true);
    setTimeout(() => {
      const element = reportRef.current;
      const repoName = linkedUrl ? linkedUrl.split('/').pop() : 'repository';
      const dateStamp = new Date().toISOString().split('T')[0];
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);

      const opt = {
        margin: 0.3,
        filename: `ProjectVerified_Report_${repoName}_${dateStamp}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          scrollY: 0,
          windowWidth: 1200,
          windowHeight: element.scrollHeight + 100
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
      };

      html2pdf().set(opt).from(element).save().then(() => {
        window.scrollTo(0, originalScrollY);
        setIsPrinting(false);
      });
    }, 800);
  };

  const isAuthentic = data?.analysis?.status === 'Authentic';

  return (
    <div className="dashboard-wrapper">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <div className="logo-icon">
              <Activity className="text-white" size={24} />
            </div>
            <h1>Project-<span>Verified</span></h1>
          </div>

          <div className="nav-actions">
            {data && !loading && (
              <button
                onClick={handleDownloadPDF}
                disabled={isPrinting}
                className="btn-primary"
              >
                {isPrinting ? <Activity className="animate-spin" size={16} /> : <Download size={16} />}
                {isPrinting ? "Generating..." : "Export Forensic PDF"}
              </button>
            )}
            <button onClick={onReset} className="btn-secondary">
              <ArrowLeft size={16} /> New Audit
            </button>
          </div>
        </div>
      </nav>

      {loading && (
        <div className="loading-state">
          <div className="loader-icon-wrapper">
            <Activity size={40} className="animate-spin" />
          </div>
          <h2>Parsing Concrete Syntax Trees...</h2>
          <p>Extracting mathematical semantics from {linkedUrl?.split('/').pop() || 'repository'}</p>
        </div>
      )}

      {data && !loading && (
        <div
          ref={reportRef}
          className={`report-container ${isPrinting ? 'is-printing' : 'animate-in'}`}
        >
          <div className="dashboard-grid">

            {/* HERO METRIC */}
            <div className={`card hero-card ${isAuthentic ? 'authentic' : 'warning'}`}>
              <div className="watermark"><Fingerprint size={150} /></div>
              <p className="card-label">
                <ShieldCheck size={16} /> Integrity Score
              </p>
              <h2 className="score-value">{data.analysis.rewardScore.toFixed(2)}</h2>
              <div className="status-badge-wrapper">
                <span className="status-badge">
                  {isAuthentic ? <CheckCircle size={16} /> : <Activity size={16} />}
                  {data.analysis.status}
                </span>
              </div>
            </div>

            {/* EVOLUTION PULSE */}
            <div className="card graph-card">
              <div className="card-header">
                <h3>Evolution Pulse</h3>
                <p>Current score: {data.analysis.rewardScore.toFixed(2)} over recent commits</p>
              </div>
              <div className={`chart-container ${isPrinting ? 'print-fixed-height' : ''}`}>
                <ResponsiveContainer width="100%" height={isPrinting ? 250 : "100%"}>
                  <AreaChart data={data.pulseData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    <Area isAnimationActive={!isPrinting} type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* MINI STATS */}
            <div className="card mini-card">
              <div><p className="mini-label">Old AST Nodes</p><p className="mini-value">{data.analysis.oldNodeCount}</p></div>
              <div className="icon-box"><Layers size={24} /></div>
            </div>
            <div className="card mini-card highlight">
              <div><p className="mini-label">New AST Nodes</p><p className="mini-value">{data.analysis.newNodeCount}</p></div>
              <div className="icon-box"><Layers size={24} /></div>
            </div>
            <div className="card mini-card distance">
              <div><p className="mini-label">Zhang-Shasha Distance</p><p className="mini-value">{data.analysis.editDistance}</p></div>
              <div className="icon-box"><Cpu size={24} /></div>
            </div>

            {/* CLUSTERS */}
            {Object.entries(data.clusters).map(([key, group]) => (
              <div key={key} className={`card cluster-card border-${key}`}>
                <div className="cluster-header">
                  <h4>{group.label}</h4>
                  <span className="badge">{group.commits.length} Commits</span>
                </div>
                <div className={`cluster-list ${isPrinting ? '' : 'scrollable'}`}>
                  {group.commits.map((c, i) => (
                    <div key={i} className="commit-mini-row">
                      <span className="sha">{c.sha}</span>
                      <span className="score">r: {c.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* HISTORY LOG */}
            <div className="card log-card">
              <h3 className="card-title"><GitCommit size={20} /> Verified History Log</h3>
              <div className={`log-list ${isPrinting ? '' : 'scrollable'}`}>
                {data.commits.map((commit, i) => (
                  <div key={i} className="log-item">
                    <div className="log-info">
                      <div className="log-meta">
                        <span className="sha-tag">{commit.sha}</span>
                        <span className="author">{commit.author}</span>
                      </div>
                      <p className="message">{commit.message}</p>
                    </div>
                    <span className="date">{new Date(commit.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RAW OUTPUT */}
            <div className="card terminal-card">
              <h3 className="terminal-title"><Terminal size={16} /> Raw CST Fragment</h3>
              <div className={`terminal-content ${isPrinting ? 'print-wrap' : 'scrollable'}`}>
                {data.analysis.cst}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default GitPulseMVP;