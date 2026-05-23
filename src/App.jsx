import React, { useEffect, useState } from 'react';
import GithubConnect from './components/GithubConnect';
import GitPulseMVP from './components/GitPulseMVP';
import ClassroomMatrix from './components/ClassroomMatrix';
import './App.css';
import { Link, Route, Routes } from 'react-router-dom';
import QuarantinePage from './components/Admin/QuarantinePage';

const APP_SESSION_KEY = 'gitpulse.activeSession';
const APP_SESSION_VERSION = 2;

function App() {
  const [repoLinked, setRepoLinked] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [auditDocument, setAuditDocument] = useState(null);
  const [initialAnalysisData, setInitialAnalysisData] = useState(null);

  const [viewMode, setViewMode] = useState('single');

  useEffect(() => {
    try {
      const savedSession = sessionStorage.getItem(APP_SESSION_KEY);
      if (!savedSession) return;

      const parsed = JSON.parse(savedSession);
      if ((parsed?.version ?? 1) !== APP_SESSION_VERSION) {
        sessionStorage.removeItem(APP_SESSION_KEY);
        return;
      }
      if (!parsed?.repoUrl || !parsed?.analysisData) return;

      setRepoUrl(parsed.repoUrl);
      setInitialAnalysisData(parsed.analysisData);
      setRepoLinked(true);
      setViewMode(parsed.viewMode === 'bulk' ? 'bulk' : 'single');
    } catch (error) {
      console.error('Failed to restore GitPulse session:', error);
      sessionStorage.removeItem(APP_SESSION_KEY);
    }
  }, []);

  const persistActiveSession = ({ nextRepoUrl, analysisData, nextViewMode = viewMode }) => {
    if (!nextRepoUrl || !analysisData) return;

    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify({
      version: APP_SESSION_VERSION,
      repoUrl: nextRepoUrl,
      analysisData,
      viewMode: nextViewMode
    }));
  };

  // Callback to move from linking to analysis
  const handleConnectionSuccess = (payload) => {
    if (typeof payload === 'string') {
      setRepoUrl(payload);
    } else {
      setRepoUrl(payload.url);
      setAuditDocument(payload.document);
    }
    setInitialAnalysisData(null);
    setRepoLinked(true);
  };

  const handleAnalysisDataChange = (analysisData) => {
    setInitialAnalysisData(analysisData);
    persistActiveSession({
      nextRepoUrl: repoUrl,
      analysisData
    });
  };

  // Callback to reset the app state to scan a new repository
  const handleReset = () => {
    setRepoLinked(false);
    setRepoUrl('');
    setAuditDocument(null);
    setInitialAnalysisData(null);
    setViewMode('single');
    sessionStorage.removeItem(APP_SESSION_KEY);
  };

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="logo-text">Git<span className="accent">Pulse</span></div>
        <div className="status-badge">
          {repoLinked ? '● Analysis Active' : '○ Awaiting Connection'}
        </div>
        {/* Admin navigation link */}
        <Link to="/admin/quarantine" className="admin-link">
          Quarantine Queue
        </Link>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/admin/quarantine" element={<QuarantinePage />} />
          <Route
            path="/"
            element={
              viewMode === 'bulk' ? (
                <ClassroomMatrix onReset={handleReset} />
              ) : (
                <div className="glass-card">
                  {!repoLinked ? (
                    <>
                      <GithubConnect onRepoLinked={handleConnectionSuccess} />
                      {/* NEW: Button to trigger the Cohort View */}
                      <div className="mt-6 border-t border-slate-200 pt-6 text-center">
                        <p className="text-sm text-slate-500 mb-3">Grading a whole class?</p>
                        <button
                          onClick={() => setViewMode('bulk')}
                          className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all border border-slate-300"
                        >
                          Launch Cohort Matrix (CSV Upload)
                        </button>
                      </div>
                    </>
                  ) : (
                    <GitPulseMVP
                      linkedUrl={repoUrl}
                      auditDocument={auditDocument}
                      onReset={handleReset}
                      initialData={initialAnalysisData}
                      onDataChange={handleAnalysisDataChange}
                    />
                  )}
                </div>
              )
            }
          />
        </Routes>
      </main>

      <footer className="footer">
        <p className="read-the-docs">Git-Pulse Semantic Intelligence v1.0</p>
      </footer>
    </div>
  );
}

export default App;
