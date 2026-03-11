import React, { useState } from 'react';
import { Github, Shield, CheckCircle, AlertCircle } from 'lucide-react';

const GithubConnect = ({ onRepoLinked }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [isConsented, setIsConsented] = useState(false);

  const handleLinkRepo = () => {
    if (!isConsented) {
      alert("Verification requires your consent for data processing under DPDPA 2023 guidelines.");
      return;
    }
    if (repoUrl.includes('github.com')) {
      onRepoLinked(repoUrl);
    } else {
      alert("Please enter a valid GitHub URL.");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-lg border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <Github size={32} />
        <h2 className="text-2xl font-bold">Connect Repository</h2>
      </div>
      <input
        type="text"
        placeholder="https://github.com/username/project"
        className="w-full px-4 py-3 rounded-xl border mb-4 outline-none focus:ring-2 focus:ring-blue-500"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
      />
      <div className="flex items-start gap-2 mb-6">
        <input type="checkbox" className="mt-1" checked={isConsented} onChange={(e) => setIsConsented(e.target.checked)} />
        <span className="text-sm text-gray-600">I consent to Git history analysis for Graduation Outcome (GO) verification[cite: 3, 72].</span>
      </div>
      <button onClick={handleLinkRepo} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
        Link Project History
      </button>
    </div>
  );
};

export default GithubConnect;