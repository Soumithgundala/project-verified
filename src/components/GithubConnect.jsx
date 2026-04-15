import React, { useState } from 'react';
import { Github, Shield, CheckCircle, Lock, Link as LinkIcon, UploadCloud } from 'lucide-react';

const GithubConnect = ({ onRepoLinked }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [auditFile, setAuditFile] = useState(null);
  const [isConsented, setIsConsented] = useState(false);
  const [error, setError] = useState('');

  const handleLinkRepo = () => {
    setError('');

    if (!isConsented) {
      setError("Verification requires DPDPA 2023 consent.");
      return;
    }

    if (repoUrl.toLowerCase().includes('github.com')) {
      onRepoLinked({ url: repoUrl, document: auditFile });
    } else {
      setError("Please enter a valid GitHub repository URL.");
    }
  };

  return (
    <div className="connect-container">
      {/* Header Section */}
      <div className="connect-header">
        <div className="icon-badge">
          <Github size={32} strokeWidth={1.5} />
        </div>
        <h2 className="connect-title">Connect Repository</h2>
        <p className="connect-subtitle">Link your project history to start the semantic integrity analysis.</p>
      </div>

      {/* Input Section */}
      <div className="input-group">
        <div className="input-wrapper">
          <LinkIcon className="input-icon" size={18} />
          <input
            type="text"
            placeholder="https://github.com/username/repo"
            className={`custom-input ${error && !repoUrl.includes('github.com') ? 'input-error' : ''}`}
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              if (error) setError('');
            }}
          />
        </div>
      </div>

      {/* --- NEW: DOCUMENT UPLOAD ZONE --- */}
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 mb-6 bg-slate-50 hover:bg-slate-100 transition-colors text-center relative" style={{ margin: '0 0 20px 0', border: '2px dashed #cbd5e1', padding: '16px', borderRadius: '8px', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <input 
          type="file" 
          accept=".docx,.pdf"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          onChange={(e) => setAuditFile(e.target.files[0])}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
          <UploadCloud size={32} style={{ color: auditFile ? '#10b981' : '#94a3b8', marginBottom: '8px' }} />
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>
            {auditFile ? auditFile.name : "Upload Student Report (.docx)"}
          </span>
          {!auditFile && <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Cross-reference documentation against codebase</span>}
        </div>
      </div>

      {/* Consent Section */}
      <label className={`consent-box ${isConsented ? 'active' : ''}`}>
        <div className="checkbox-wrapper">
          <input
            type="checkbox"
            checked={isConsented}
            onChange={(e) => {
              setIsConsented(e.target.checked);
              if (error) setError('');
            }}
          />
          <div className="custom-checkbox">
            {isConsented && <CheckCircle size={14} fill="currentColor" />}
          </div>
        </div>
        <div className="consent-text">
          <span className="consent-label">DPDPA 2023 Compliance</span>
          <p>I consent to Git history analysis for Graduation Outcome validation.</p>
        </div>
      </label>

      {/* Feedback & Action */}
      <div className="action-area">
        {error && (
          <div className="error-message">
            <Lock size={14} /> {error}
          </div>
        )}

        <button
          onClick={handleLinkRepo}
          className="connect-button"
          disabled={!repoUrl}
        >
          Link Project History
        </button>
      </div>

      <div className="security-footer">
        <Shield size={12} />
        <span>Encrypted end-to-end semantic processing</span>
      </div>
    </div>
  );
};

export default GithubConnect;