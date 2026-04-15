import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { 
  ShieldCheck, ShieldAlert, CheckCircle, Users, Terminal, GitCommit, 
  Fingerprint, Layers, Cpu, Activity, FileText, XCircle, AlertCircle 
} from 'lucide-react';
import '../styles/GitPulse/GitPulseDashboard.css';

const GitPulseDashboard = ({ data, isModalView, isAuthentic }) => {
  return (
    <div className={`report-container ${isModalView ? 'modal-view' : ''}`}>
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

        {/* --- CROSS-MODAL ALIGNMENT MATRIX --- */}
        {data.matrix && (
          <div className="card matrix-card">
            <div className="matrix-header">
              <div className="matrix-title-container">
                <h3 className="matrix-title">
                  <FileText size={20} className="text-blue-600" /> Document Alignment Matrix
                </h3>
                <p className="matrix-subtitle">
                  Verifying extracted claims from report against repository logic.
                </p>
              </div>

              {/* Alignment Score Badge */}
              <div className="matrix-score-badge">
                <p className="matrix-score-label">Alignment Score</p>
                <span className={`matrix-score-value ${
                  data.alignmentScore >= 80 ? 'matrix-score-high' :
                  data.alignmentScore >= 50 ? 'matrix-score-medium' :
                  'matrix-score-low'
                }`}>
                  {data.alignmentScore}%
                </span>
              </div>
            </div>

            <div className="matrix-container">
              {data.matrix.map((item, index) => {
                const isVerified = item.status.includes('Verified');
                const isMissing = item.status.includes('Missing');
                
                return (
                  <div 
                    key={index} 
                    className={`matrix-item ${
                      isVerified ? 'matrix-item-verified' : 
                      isMissing ? 'matrix-item-missing' : 
                      'matrix-item-warning'
                    }`}
                  >
                    <div className="matrix-item-left">
                      {isVerified ? (
                        <CheckCircle size={18} style={{ color: '#10b981' }} />
                      ) : isMissing ? (
                        <XCircle size={18} style={{ color: '#f43f5e' }} />
                      ) : (
                        <AlertCircle size={18} style={{ color: '#f59e0b' }} />
                      )}
                      
                      <span className={`matrix-item-name ${
                        isVerified ? 'matrix-name-verified' : 
                        isMissing ? 'matrix-name-missing' : 
                        'matrix-name-warning'
                      }`}>
                        {item.name}
                      </span>
                    </div>
                    
                    <span className={`matrix-item-status ${
                      isVerified ? 'matrix-status-verified' : 
                      isMissing ? 'matrix-status-missing' : 
                      'matrix-status-warning'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {Object.entries(data.clusters).map(([key, group]) => (
          <div key={key} className={`card cluster-card border-${key}`}>
            <div className="cluster-header">
              <h4>{group.label}</h4>
              <span className="badge">{group.commits.length} Commits</span>
            </div>
            <div className="cluster-list scrollable">
              {group.commits.map((c, i) => (
                <div key={i} className="commit-mini-row">
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span className="sha-text">
                      {c.message ? c.message.split('\n')[0].substring(0, 35) + (c.message.length > 35 ? '…' : '') : c.sha}
                    </span>
                    <span className="sha-id">{c.sha}</span>
                  </div>
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

        {/* --- CONTRIBUTOR FORENSICS CARD --- */}
        {data.authorStats && data.authorStats.length > 0 && (
          <div className="card log-card">
            <div className="author-forensics-header">
              <h3 className="card-title">
                <Users size={20} /> Contributor Forensics
              </h3>
              <span className="author-badge">
                {data.authorStats.length} Unique Author{data.authorStats.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="scrollable" style={{ maxHeight: '250px' }}>
              {data.authorStats.map((author, i) => {
                const authorScoreClass = author.averageScore >= 0.85 ? 'author-score-high' : author.averageScore >= 0.45 ? 'author-score-mid' : 'author-score-low';
                return (
                  <div key={i} className="author-item">
                    <div>
                      <p className="author-name">{author.name}</p>
                      <p className="author-commits">{author.commitCount} verified commits</p>
                    </div>
                    <div>
                      <p className="author-score-label">Avg Score</p>
                      <div style={{ textAlign: 'right' }}>
                         <span className={`author-score-value ${authorScoreClass}`}>
                           {author.averageScore.toFixed(2)}
                         </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="card terminal-card">
          <h3 className="terminal-title"><Terminal size={16} /> Raw CST Fragment</h3>
          <div className="terminal-content scrollable">
            {data.analysis.cst}
          </div>
        </div>

        {/* --- SEMANTIC INTELLIGENCE DASHBOARD --- */}
        {data.intelligence && (
          <div className="card semantic-dashboard">
            <div className="semantic-flex">

              {/* LEFT COLUMN: Global Originality & Two-Strike Status */}
              <div className="semantic-col">
                <h3 className="card-title">
                  <Fingerprint size={20} style={{ color: '#4f46e5' }} /> Global Origin Check
                </h3>

                <div className={`global-origin-box ${data.intelligence.globalOriginality?.status === 'Original' ? 'original' : (data.intelligence.globalOriginality?.status?.includes('Clone') ? 'clone' : 'pending')}`}>
                  <div className="origin-status-header">
                    {data.intelligence.globalOriginality?.status === 'Original'
                      ? <CheckCircle size={24} style={{ color: '#059669' }} />
                      : <ShieldAlert size={24} style={{ color: '#e11d48' }} />}
                    <h4>
                      {data.intelligence.globalOriginality?.status || 'Pending'}
                    </h4>
                  </div>

                  {data.intelligence.globalOriginality?.similarityScore && (
                    <div className="ast-match-box">
                      <span className="ast-match-label">AST Structural Match:</span>
                      <span className="ast-match-score">{data.intelligence.globalOriginality.similarityScore}</span>
                    </div>
                  )}

                  {data.intelligence.globalOriginality?.matches?.length > 0 && (
                    <div className="source-matches-wrap">
                      <p className="source-matches-label">Identified Source:</p>
                      {data.intelligence.globalOriginality.matches.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noreferrer" className="source-match-link">
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: LLM Markdown Summary */}
              <div className="semantic-col-large">
                <h3 className="card-title">
                  <Activity size={20} style={{ color: '#4f46e5' }} /> AI Semantic Breakdown
                </h3>
                <div className="scrollable ai-summary-box">
                  <div className="ai-summary-text">
                    {typeof data.intelligence.llmSummary === 'string'
                      ? data.intelligence.llmSummary
                      : data.intelligence.llmSummary?.overall_logic_summary || "No semantic summary available."}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default GitPulseDashboard;
