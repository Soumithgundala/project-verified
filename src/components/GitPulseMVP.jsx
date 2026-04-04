import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, CheckCircle, Terminal, GitCommit, Fingerprint, Layers, Cpu, ArrowLeft, Download, HelpCircle, X } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import './GitPulseMVP.css';

// NEW: Added initialData and isModalView props
const GitPulseMVP = ({ linkedUrl, onReset, initialData = null, isModalView = false }) => {
  const [loading, setLoading] = useState(!initialData);
  const [data, setData] = useState(initialData);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const reportRef = useRef();

  useEffect(() => {
    // If initialData was passed from the Cohort Matrix, skip the fetch!
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

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
    if (linkedUrl && !initialData) analyzeRepo();
  }, [linkedUrl, initialData]);

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
        html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 1000 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(element).save().then(() => setIsPrinting(false));
    }, 500);
  };

  const isAuthentic = data?.analysis?.status === 'Authentic';

  return (
    <div className={`dashboard-wrapper relative ${isModalView ? 'min-h-0 pb-4' : 'min-h-screen pb-12'}`}>

      {/* Hide the top navbar if we are viewing this inside the ClassroomMatrix Modal */}
      {!isModalView && (
        <nav className="navbar" style={{ display: isPrinting ? 'none' : 'block' }}>
          <div className="nav-container">
            <div className="nav-logo">
              <div className="logo-icon"><Activity className="text-white" size={24} /></div>
              <h1>Project-<span>Verified</span></h1>
            </div>
            <div className="nav-actions">
              <button onClick={() => setShowHelpModal(true)} className="btn-secondary" style={{ marginRight: '10px' }}>
                <HelpCircle size={16} /> Metrics Guide
              </button>
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
      )}

      {/* Modal Specific Download Bar */}
      {isModalView && !isPrinting && data && !loading && (
        <div className="max-w-7xl mx-auto px-6 pt-4 flex justify-end">
          <button onClick={handleDownloadPDF} disabled={isPrinting} className="btn-primary shadow-md">
            {isPrinting ? <Activity className="animate-spin" size={16} /> : <Download size={16} />}
            {isPrinting ? "Generating..." : "Download Individual Report PDF"}
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="loader-icon-wrapper"><Activity size={40} className="animate-spin" /></div>
          <h2>Parsing Concrete Syntax Trees...</h2>
          <p>Extracting mathematical semantics from {linkedUrl?.split('/').pop() || 'repository'}</p>
        </div>
      )}

      {/* --- DATA WRAPPER --- */}
      {data && !loading && (
        <div ref={reportRef}>
          {/* LAYOUT 1: THE WEB DASHBOARD */}
          <div className="report-container" style={{ display: isPrinting ? 'none' : 'block', marginTop: isModalView ? '1rem' : '2rem' }}>
            <div className="dashboard-grid">

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

              <div className="card terminal-card">
                <h3 className="terminal-title"><Terminal size={16} /> Raw CST Fragment</h3>
                <div className="terminal-content scrollable">
                  {data.analysis.cst}
                </div>
              </div>

              <div className="card" style={{ gridColumn: 'span 12' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
                  <Cpu size={20} style={{ color: '#4f46e5' }} /> AI Semantic Analysis Summary
                </h3>
                <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155' }}>
                  {typeof data.intelligence?.llmSummary === 'string' ? data.intelligence.llmSummary : data.intelligence?.llmSummary?.overall_logic_summary || "No semantic summary generated for this repository."}
                </div>
              </div>

            </div>
          </div>

          {/* LAYOUT 2: THE FORENSIC PDF TEMPLATE */}
          {/* PDF: INTELLIGENCE SUMMARY BLOCK */}
          {/* PDF: INTELLIGENCE SUMMARY BLOCK */}
          {data.intelligence && (
            <div style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>

              {/* Global Clone Status */}
              <div style={{ padding: '15px', borderRadius: '8px', marginBottom: '15px', borderLeft: '6px solid', borderColor: data.intelligence.globalOriginality.status === 'Original' ? '#10b981' : '#f43f5e', backgroundColor: '#f8fafc' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', color: '#0f172a' }}>
                  Global Fingerprint Check: <span style={{ color: data.intelligence.globalOriginality.status === 'Original' ? '#10b981' : '#f43f5e' }}>{data.intelligence.globalOriginality.status}</span>
                </h3>
                {data.intelligence.globalOriginality.matches?.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>MATCHED SOURCES:</p>
                    {data.intelligence.globalOriginality.matches.map((url, idx) => (
                      <p key={idx} style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#4f46e5' }}>{url}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* LLM Semantic Summary */}
              {data.intelligence.llmSummary && (
                <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>AI Semantic Summary</h3>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#334155' }}>
                    {data.intelligence.llmSummary.overall_logic_summary}
                  </p>

                  <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>KEY PATTERNS DETECTED:</p>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
                        {data.intelligence.llmSummary.key_patterns?.map((pattern, idx) => (
                          <li key={idx}>{pattern}</li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>LIKELY SOURCE:</p>
                      <p style={{ margin: 0, fontSize: '13px', color: '#334155', fontWeight: 'bold' }}>{data.intelligence.llmSummary.likely_source}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {data.intelligence && (
            <div style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>

              {/* Global Clone Status
              <div style={{ padding: '15px', borderRadius: '8px', marginBottom: '15px', borderLeft: '6px solid', borderColor: data.intelligence.globalOriginality.status === 'Original' ? '#10b981' : '#f43f5e', backgroundColor: '#f8fafc' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', color: '#0f172a' }}>
                  Global Fingerprint Check: <span style={{ color: data.intelligence.globalOriginality.status === 'Original' ? '#10b981' : '#f43f5e' }}>{data.intelligence.globalOriginality.status}</span>
                </h3>
                {data.intelligence.globalOriginality.matches?.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>MATCHED SOURCES:</p>
                    {data.intelligence.globalOriginality.matches.map((url, idx) => (
                      <p key={idx} style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#4f46e5' }}>{url}</p>
                    ))}
                  </div>
                )}
              </div> */}

              {/* LLM Semantic Summary */}
              {/* {data.intelligence.llmSummary && (
                <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>AI Semantic Summary</h3>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#334155' }}>
                    {data.intelligence.llmSummary.overall_logic_summary}
                  </p>

                  <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>KEY PATTERNS DETECTED:</p>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
                        {data.intelligence.llmSummary.key_patterns?.map((pattern, idx) => (
                          <li key={idx}>{pattern}</li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>LIKELY SOURCE:</p>
                      <p style={{ margin: 0, fontSize: '13px', color: '#334155', fontWeight: 'bold' }}>{data.intelligence.llmSummary.likely_source}</p>
                    </div>
                  </div>
                </div>
              )} */}
            </div>
          )}
          <div style={{ display: isPrinting ? 'block' : 'none', width: '900px', margin: '0 auto', background: 'white', padding: '20px', color: 'black', fontFamily: 'sans-serif' }}>
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

            <div style={{ pageBreakInside: 'avoid', marginBottom: '40px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>Raw CST Fragment</h3>
              <div style={{ backgroundColor: '#0f172a', color: '#10b981', padding: '20px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {data.analysis.cst}
              </div>
            </div>

            <div style={{ pageBreakInside: 'avoid', marginBottom: '40px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '15px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>AI Semantic Analysis Summary</h3>
              <div style={{ backgroundColor: '#f8fafc', color: '#334155', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #4f46e5', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {typeof data.intelligence?.llmSummary === 'string' ? data.intelligence.llmSummary : data.intelligence?.llmSummary?.overall_logic_summary || "No semantic summary generated for this repository."}
              </div>
            </div>

            {/* APPENDIX */}
            <div style={{ pageBreakBefore: 'always', paddingTop: '20px' }}>
              <h2 style={{ fontSize: '24px', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>Appendix: Understanding the Metrics</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#334155', lineHeight: '1.6' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #4f46e5' }}>
                  <h4 style={{ fontSize: '16px', color: '#0f172a', marginTop: '0', marginBottom: '8px' }}>1. What are AST Nodes? (Old vs. New)</h4>
                  <p style={{ margin: 0, fontSize: '14px' }}>An Abstract Syntax Tree (AST) is a mathematical representation of the code's structure. <strong> Old AST Nodes</strong> represent the complexity of the codebase <em>before</em> the commit. <strong> New AST Nodes</strong> represent the complexity <em>after</em> the commit. Comparing them allows us to measure exact structural growth.</p>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #4f46e5' }}>
                  <h4 style={{ fontSize: '16px', color: '#0f172a', marginTop: '0', marginBottom: '8px' }}>2. How is the Integrity Score Calculated?</h4>
                  <p style={{ margin: 0, fontSize: '14px' }}>The engine uses the Zhang-Shasha algorithm to calculate the <strong>Tree Edit Distance</strong> (the minimum number of semantic operations needed to transform the Old AST into the New AST). The Integrity Score ($r$) is calculated as: <code>1 - (Edit Distance / Max Nodes)</code>. A massive injection of code without gradual human edits results in a low score.</p>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                  <h4 style={{ fontSize: '16px', color: '#0f172a', marginTop: '0', marginBottom: '8px' }}>3. What is considered a Good Score?</h4>
                  <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '14px' }}>
                    <li style={{ marginBottom: '4px' }}><strong>0.85 - 1.00 (Authentic):</strong> Indicates steady, human-paced development and careful refactoring.</li>
                    <li style={{ marginBottom: '4px' }}><strong>0.45 - 0.84 (Standard):</strong> Normal feature additions and expected structural modifications.</li>
                    <li><strong>0.00 - 0.44 (Suspect):</strong> Anomalous "High-Velocity Dumps." Often indicates pasting large AI-generated blocks or uncredited boilerplate.</li>
                  </ul>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #f43f5e' }}>
                  <h4 style={{ fontSize: '16px', color: '#f8fafc', marginTop: '0', marginBottom: '8px' }}>4. How to read the Raw CST Fragment?</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>The Concrete Syntax Tree (CST) fragment is the raw grammar output generated by our parsers. It strips away formatting and exposes how the machine interprets the logic. It acts as the immutable forensic proof used to calculate the edit distance.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {showHelpModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ position: 'sticky', top: 0, backgroundColor: 'white', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px 16px 0 0', zIndex: 10 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><HelpCircle className="text-indigo-600" /> Metrics Guide</h2>
              <button onClick={() => setShowHelpModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={18} className="text-indigo-500" /> AST Nodes</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 }}>An Abstract Syntax Tree (AST) is a mathematical representation of code. <strong>Old Nodes</strong> measure the code's complexity before a commit, while <strong>New Nodes</strong> measure it after. This allows us to track exact structural growth rather than just "lines of code."</p>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} className="text-emerald-500" /> Integrity Score Calculation</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 }}>The engine uses the Zhang-Shasha algorithm to calculate the <strong>Tree Edit Distance</strong> (the effort required to change the Old AST into the New AST). The Integrity Score ($r$) normalizes this distance from 0 to 1. A sudden, massive injection of nodes without gradual human edits yields a low score.</p>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Activity size={18} className="text-blue-500" /> Score Benchmarks</h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div style={{ padding: '12px', backgroundColor: '#ecfdf5', borderRadius: '8px', fontSize: '13px', color: '#065f46' }}><strong>0.85 - 1.00 (Authentic):</strong> Steady, human-paced development.</div>
                  <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', fontSize: '13px', color: '#1e40af' }}><strong>0.45 - 0.84 (Standard):</strong> Normal feature additions.</div>
                  <div style={{ padding: '12px', backgroundColor: '#fff1f2', borderRadius: '8px', fontSize: '13px', color: '#9f1239' }}><strong>0.00 - 0.44 (Suspect):</strong> Anomalous dumps (likely AI-generated or copy-pasted).</div>
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Terminal size={18} className="text-slate-700" /> Raw CST Fragment</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 }}>The Concrete Syntax Tree (CST) fragment is the raw grammar output generated by our parsers. It strips away formatting and exposes how the machine interprets the logic. It is the immutable forensic proof used to calculate the edit distance.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GitPulseMVP;