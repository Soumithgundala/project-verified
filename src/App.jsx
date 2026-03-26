import React, { useState } from 'react';
import GithubConnect from './components/GithubConnect';
import GitPulseMVP from './components/GitPulseMVP';
import './App.css';

function App() {
  const [repoLinked, setRepoLinked] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');

  // Callback to move from linking to analysis
  const handleConnectionSuccess = (url) => {
    setRepoUrl(url);
    setRepoLinked(true);
  };

  // Callback to reset the app state to scan a new repository
  const handleReset = () => {
    setRepoLinked(false);
    setRepoUrl('');
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
        <div className="glass-card">
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
        </div>
      </main>

      <footer className="footer">
        <p className="read-the-docs">Git-Pulse Semantic Intelligence v1.0</p>
      </footer>
    </div>
  );
}

export default App;