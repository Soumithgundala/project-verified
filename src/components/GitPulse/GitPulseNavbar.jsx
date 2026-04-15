import React from 'react';
import { Activity, HelpCircle, Download, ArrowLeft } from 'lucide-react';
import '../styles/GitPulse/GitPulseNavbar.css';

const GitPulseNavbar = ({ 
  isModalView, 
  isPrinting, 
  setShowHelpModal, 
  data, 
  loading, 
  handleDownloadPDF, 
  onReset 
}) => {
  if (isModalView) {
    if (!isPrinting && data && !loading) {
      return (
        <div className="btn-modal-dl-wrapper">
          <button onClick={handleDownloadPDF} disabled={isPrinting} className="btn-primary shadow-md">
            {isPrinting ? <Activity className="animate-spin" size={16} /> : <Download size={16} />}
            {isPrinting ? "Generating..." : "Download Individual Report PDF"}
          </button>
        </div>
      );
    }
    return null;
  }

  return (
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
  );
};

export default GitPulseNavbar;
