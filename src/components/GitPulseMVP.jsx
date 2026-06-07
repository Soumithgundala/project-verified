import React, { useState, useEffect, useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { Activity } from 'lucide-react';
import './styles/GitPulse/GitPulseMVP.css';

import GitPulseNavbar from './GitPulse/GitPulseNavbar';
import GitPulseDashboard from './GitPulse/GitPulseDashboard';
import GitPulsePdfReport from './GitPulse/GitPulsePdfReport';
import GitPulseHelpModal from './GitPulse/GitPulseHelpModal';

const inFlightAnalyses = new Map();

// NEW: Added initialData and isModalView props
const GitPulseMVP = ({ linkedUrl, auditDocument, onReset, initialData = null, isModalView = false, onDataChange = null }) => {
  const [loading, setLoading] = useState(!initialData);
  const [data, setData] = useState(initialData);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const reportRef = useRef();
  const activeRequestKey = useRef(null);

  useEffect(() => {
    // If initialData was passed from the Cohort Matrix, skip the fetch!
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    const requestKey = `${linkedUrl || ''}:${auditDocument?.name || ''}:${auditDocument?.size || 0}`;
    if (activeRequestKey.current === requestKey) return;
    activeRequestKey.current = requestKey;

    const analyzeRepo = async () => {
      try {
        if (!inFlightAnalyses.has(requestKey)) {
          inFlightAnalyses.set(requestKey, (async () => {
            if (!linkedUrl && auditDocument) {
              // 1. Upload the document to GET a job started
              const formData = new FormData();
              formData.append('document', auditDocument);
              const uploadResp = await fetch('http://localhost:5000/api/documents/upload', {
                method: 'POST',
                body: formData,
              }).then(r => r.json());

              if (!uploadResp.success) {
                throw new Error(uploadResp.message || 'Upload failed');
              }

              const docId = uploadResp.documentId;
              
              // 2. Poll the status until completed
              const pollStatus = async () => {
                const statusResp = await fetch(`http://localhost:5000/api/documents/${docId}`).then(r => r.json());
                if (!statusResp.success) {
                  throw new Error(statusResp.message || 'Polling failed');
                }
                if (statusResp.document.status === 'completed') {
                  return statusResp.document;
                }
                if (statusResp.document.status === 'failed') {
                  throw new Error(statusResp.document.errorMessage || 'Document processing failed');
                }
                // Wait 1.5s and try again
                await new Promise(resolve => setTimeout(resolve, 1500));
                return pollStatus();
              };

              const docResult = await pollStatus();
              return [null, docResult];
            } else {
              const repoFetch = fetch('http://localhost:5000/api/link-repo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: linkedUrl }),
              }).then(r => r.json());

              let auditFetch = Promise.resolve({});
              if (auditDocument) {
                const formData = new FormData();
                formData.append('githubUrl', linkedUrl);
                formData.append('document', auditDocument);
                auditFetch = fetch('http://localhost:5000/api/audit-document', {
                  method: 'POST',
                  body: formData,
                }).then(r => r.json());
              }

              return Promise.all([repoFetch, auditFetch]);
            }
          })().finally(() => {
            inFlightAnalyses.delete(requestKey);
          }));
        }

        const [repoResult, auditResult] = await inFlightAnalyses.get(requestKey);

        if (!linkedUrl && auditResult) {
          setData({ success: true, documentOnly: true, document: auditResult });
        } else if (repoResult && repoResult.success) {
          setData({ ...repoResult, ...auditResult });
        } else {
          throw new Error("Repository analysis failed");
        }
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setLoading(false);
        activeRequestKey.current = null;
      }
    };
    if ((linkedUrl || auditDocument) && !initialData) analyzeRepo();
  }, [linkedUrl, auditDocument, initialData]);

  useEffect(() => {
    if (!data || !onDataChange || isModalView) return;
    onDataChange(data);
  }, [data, onDataChange, isModalView]);

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
    <div className={`dashboard-wrapper relative ${isModalView ? 'modal-view' : ''}`}>
      
      <GitPulseNavbar
        isModalView={isModalView}
        isPrinting={isPrinting}
        setShowHelpModal={setShowHelpModal}
        data={data}
        loading={loading}
        handleDownloadPDF={handleDownloadPDF}
        onReset={onReset}
      />

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
          <div style={{ display: isPrinting ? 'none' : 'block' }}>
            <GitPulseDashboard data={data} setData={setData} isModalView={isModalView} isAuthentic={isAuthentic} />
          </div>

          {/* LAYOUT 2: THE FORENSIC PDF TEMPLATE */}
          <GitPulsePdfReport data={data} linkedUrl={linkedUrl} isAuthentic={isAuthentic} isPrinting={isPrinting} />
        </div>
      )}

      {/* HELP MODAL */}
      <GitPulseHelpModal show={showHelpModal} onClose={() => setShowHelpModal(false)} />

    </div>
  );
};

export default GitPulseMVP;
