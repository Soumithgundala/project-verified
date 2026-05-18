import React, { useState } from 'react';
import GithubConnect from './components/GithubConnect';
import GitPulseMVP from './components/GitPulseMVP';
import ClassroomMatrix from './components/ClassroomMatrix';
import './App.css';

function App() {
  const [repoLinked, setRepoLinked] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [auditDocument, setAuditDocument] = useState(null);

  const [viewMode, setViewMode] = useState('single');

  // Callback to move from linking to analysis
  const handleConnectionSuccess = (payload) => {
    if (typeof payload === 'string') {
      setRepoUrl(payload);
    } else {
      setRepoUrl(payload.url);
      setAuditDocument(payload.document);
    }
    setRepoLinked(true);
  };

  // Callback to reset the app state to scan a new repository
  const handleReset = () => {
    setRepoLinked(false);
    setRepoUrl('');
    setAuditDocument(null);
    setViewMode('single');
  };

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="logo-text">Git<span className="accent">Pulse</span></div>
        <div className="status-badge">
          {repoLinked ? '● Analysis Active' : '○ Awaiting Connection'}
        </div>
      </nav>

      <main className="main-content">
        {/* <div className="glass-card">
          {!repoLinked ? (
            // Step 1: Establish the "Integrity Stack" connection
            <GithubConnect onRepoLinked={handleConnectionSuccess} />
          ) : (
            // Step 2: Trigger Git-Pulse Semantic Analysis
            // Note: Passed both linkedUrl (your original) and repoUrl (expected by the Bento Grid) to prevent any prop mismatches!
            <GitPulseMVP
              linkedUrl={repoUrl}
              repoUrl={repoUrl}
              onReset={handleReset}
            />
          )}
        </div> */}
        {viewMode === 'bulk' ? (
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
              <GitPulseMVP linkedUrl={repoUrl} auditDocument={auditDocument} onReset={handleReset} />
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p className="read-the-docs">Git-Pulse Semantic Intelligence v1.0</p>
      </footer>
    </div>
  );
}

export default App;

