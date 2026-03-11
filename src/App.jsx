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

  return (
    <div className="app-container">
      {!repoLinked ? (
        // Step 1: Establish the "Integrity Stack" connection [cite: 11]
        <GithubConnect onRepoLinked={handleConnectionSuccess} />
      ) : (
        // Step 2: Trigger Git-Pulse Semantic Analysis [cite: 15]
        <GitPulseMVP linkedUrl={repoUrl} />
      )}
    </div>
  );
}

export default App;