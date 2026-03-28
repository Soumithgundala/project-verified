import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, CheckCircle, Terminal, GitCommit, Fingerprint, Layers, Cpu, ArrowLeft, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import './GitPulseMVP.css';

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
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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

      const opt = {
        margin: 0.4,
        filename: `ProjectVerified_Report_${repoName}_${dateStamp}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1000
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(element).save().then(() => {
        setIsPrinting(false);
      });
    }, 500);
  };

  const isAuthentic = data?.analysis?.status === 'Authentic';

  return (
    <div className="dashboard-wrapper">

      {/* --- ALWAYS VISIBLE: NAVBAR --- */}
      <nav className="navbar" style={{ display: isPrinting ? 'none' : 'block' }}>
        <div className="nav-container">
          <div className="nav-logo">
            <div className="logo-icon"><Activity className="text-white" size={24} /></div>
            <h1>Project-<span>Verified</span></h1>
          </div>
          <div className="nav-actions">
            {data && !loading && (
              <button onClick={handleDownloadPDF} disabled={isPrinting} className="btn-primary">
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

      {/* --- LOADING STATE --- */}
      {loading && (
        <div className="loading-state">
          <div className="loader-icon-wrapper">
            <Activity size={40} className="animate-spin" />
          </div>
          <h2>Parsing Concrete Syntax Trees...</h2>
          <p>Extracting mathematical semantics from {linkedUrl?.split('/').pop() || 'repository'}</p>
        </div>
      )}

      {/* --- DATA WRAPPER --- */}
      {data && !loading && (
        <div ref={reportRef}>

          {/* =========================================================
              LAYOUT 1: THE WEB DASHBOARD 
              This uses your custom CSS classes and is HIDDEN during PDF printing.
          ========================================================= */}
          <div className="report-container" style={{ display: isPrinting ? 'none' : 'block' }}>
            <div className="dashboard-grid">

              {/* HERO METRIC */}
              <div className={`card hero-card ${isAuthentic ? 'authentic' : 'warning'}`}>
                <div className="watermark"><Fingerprint size={150} /></div>
                <p className="card-label"><ShieldCheck size={16} /> Integrity Score</p>
                <h2 className="score-value">{data.analysis.rewardScore.toFixed(2)}</h2>
                <div className="status-badge-wrapper">
                  <span className="status-badge">
                    {isAuthentic ? <CheckCircle size={16} /> : <Activity size={16} />}
                    {data.analysis.status}
                  </span>
                </div>
              </div>

              {/* PULSE GRAPH */}
              <div className="card graph-card">
                <div className="card-header">
                  <h3>Evolution Pulse</h3>
                  <p>Current score: {data.analysis.rewardScore.toFixed(2)} over recent commits</p>
                </div>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.pulseData}>
                      <defs>
                        <linearGradient id="colorScoreWeb" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                      <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fill="url(#colorScoreWeb)" />
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
                  <div className="cluster-list scrollable">
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
                <div className="log-list scrollable">
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
                <div className="terminal-content scrollable">
                  {data.analysis.cst}
                </div>
              </div>

            </div>
          </div>


          {/* =========================================================
              LAYOUT 2: THE FORENSIC PDF TEMPLATE 
              This is ONLY VISIBLE to html2pdf during generation.
          ========================================================= */}
          <div style={{ display: isPrinting ? 'block' : 'none', width: '900px', margin: '0 auto', background: 'white', padding: '20px', color: 'black', fontFamily: 'sans-serif' }}>

            {/* Header */}
            <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ fontSize: '28px', margin: '0 0 10px 0', color: '#0f172a' }}>Forensic Integrity Report</h1>
                <p style={{ margin: 0, color: '#64748b' }}>Repository: <strong style={{ color: '#0f172a' }}>{linkedUrl}</strong></p>
                <p style={{ margin: 0, color: '#64748b' }}>Generated: <strong style={{ color: '#0f172a' }}>{new Date().toLocaleString()}</strong></p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Integrity Score</p>
                <h2 style={{ fontSize: '48px', margin: 0, color: '#0f172a', lineHeight: '1' }}>{data.analysis.rewardScore.toFixed(2)}</h2>
                <p style={{ margin: '5px 0 0 0', fontSize: '16px', fontWeight: 'bold', padding: '4px 12px', borderRadius: '20px', display: 'inline-block', backgroundColor: isAuthentic ? '#d1fae5' : '#ffe4e6', color: isAuthentic ? '#047857' : '#be123c' }}>
                  {data.analysis.status.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div style={{ display: 'flex', gap: '40px', marginBottom: '40px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Old AST Nodes</p>
                <p style={{ margin: '5px 0 0 0', fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{data.analysis.oldNodeCount}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>New AST Nodes</p>
                <p style={{ margin: '5px 0 0 0', fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{data.analysis.newNodeCount}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Zhang-Shasha Distance</p>
                <p style={{ margin: '5px 0 0 0', fontSize: '28px', fontWeight: 'bold', color: '#4f46e5' }}>{data.analysis.editDistance}</p>
              </div>
            </div>

            {/* Print-Friendly Graph */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Evolution Pulse</h3>
              <div style={{ height: '250px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.pulseData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <Area isAnimationActive={false} type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fillOpacity={0.1} fill="#4f46e5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Suspect Commits Alert (FIXED: Using Flex-Wrap instead of Grid) */}
            {data.clusters.suspect.commits.length > 0 && (
              <div style={{ background: '#fff1f2', padding: '20px', borderRadius: '12px', marginBottom: '40px', border: '1px solid #fecdd3' }}>
                <h3 style={{ color: '#be123c', marginTop: 0, fontSize: '18px' }}>⚠️ High-Velocity Dumps Detected ({data.clusters.suspect.commits.length})</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                  {data.clusters.suspect.commits.map(c => (
                    <div key={c.sha} style={{ flex: '1 1 calc(50% - 15px)', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ffe4e6', paddingBottom: '8px' }}>
                      <span style={{ fontFamily: 'monospace', color: '#be123c', fontWeight: 'bold' }}>{c.sha}</span>
                      <span style={{ fontWeight: 'bold', color: '#9f1239' }}>r: {c.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ALL CLUSTERS (FIXED: Stacked vertically, Commits wrapped in columns inside) */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Semantic Commit Clusters</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(data.clusters).map(([key, group]) => {
                  const borderColor = key === 'authentic' ? '#10b981' : key === 'standard' ? '#3b82f6' : '#f43f5e';
                  return (
                    <div key={key} style={{ padding: '20px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `6px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a', textTransform: 'capitalize' }}>{group.label}</h4>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '4px 10px', borderRadius: '12px' }}>{group.commits.length} Commits</span>
                      </div>

                      {/* Dense Flex-Wrap List for Commits */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                        {group.commits.length > 0 ? group.commits.map((c, i) => (
                          <div key={i} style={{ flex: '0 0 calc(33.333% - 15px)', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                            <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{c.sha}</span>
                            <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>r: {c.score}</span>
                          </div>
                        )) : (
                          <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>No commits in cluster</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Standard HTML Table for Logs */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Complete Audit Log</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', color: '#64748b' }}>
                    <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Commit SHA</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Date</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0' }}>Message</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid #e2e8f0', textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commits.map(c => (
                    <tr key={c.sha}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', color: '#4f46e5', fontWeight: 'bold' }}>{c.sha}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{new Date(c.date).toLocaleDateString()}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', color: '#0f172a' }}>{c.message.substring(0, 60)}{c.message.length > 60 ? '...' : ''}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold', color: c.score < 0.45 ? '#be123c' : '#0f172a' }}>{c.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RAW CST FRAGMENT */}
            <div style={{ pageBreakInside: 'avoid' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Raw CST Fragment</h3>
              <div style={{
                backgroundColor: '#0f172a', color: '#10b981', padding: '20px', borderRadius: '8px',
                fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all'
              }}>
                {data.analysis.cst}
              </div>
            </div>

          </div>
          {/* END LAYOUT 2 */}

        </div>
      )}
    </div>
  );
};

export default GitPulseMVP;