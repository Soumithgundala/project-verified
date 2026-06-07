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

    if (repoUrl) {
      if (repoUrl.toLowerCase().includes('github.com')) {
        onRepoLinked({ url: repoUrl, document: auditFile });
      } else {
        setError("Please enter a valid GitHub repository URL.");
      }
    } else if (auditFile) {
      onRepoLinked({ url: '', document: auditFile });
    } else {
      setError("Please enter a GitHub repository URL or upload a document.");
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

      {/* --- DOCUMENT UPLOAD ZONE --- */}
      {/* Standard pattern: input is hidden, label triggers it via htmlFor */}
      <input
        id="report-upload"
        type="file"
        accept=".docx,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => setAuditFile(e.target.files[0])}
      />
      <label htmlFor="report-upload" className="document-upload-zone">
        <UploadCloud
          size={32}
          className={`document-upload-icon ${auditFile ? 'active' : 'inactive'}`}
        />
        <span className="document-upload-name">
          {auditFile ? auditFile.name : "Upload Student Report (.docx)"}
        </span>
        {!auditFile && (
          <span className="document-upload-subtitle">
            Cross-reference documentation against codebase
          </span>
        )}
      </label>

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
          disabled={!repoUrl && !auditFile}
        >
          {repoUrl ? "Link Project History" : "Scan Document Plagiarism"}
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