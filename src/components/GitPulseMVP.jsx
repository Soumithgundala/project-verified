import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, CheckCircle, Terminal, GitCommit, Fingerprint, Layers, Cpu, ArrowLeft } from 'lucide-react';

const GitPulseMVP = ({ linkedUrl, onReset }) => {
  const [loading, setLoading] = useState(true); // Start loading immediately
  const [data, setData] = useState(null);

  useEffect(() => {
    const analyzeRepo = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/link-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: linkedUrl }),
        });

        // Check if the response is OK before trying to parse JSON
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          setData(result);
        }
      } catch (err) {
        console.error("Analysis failed:", err);
        // Optional: Add a state here like setFetchError(true) to show an error message on screen
      } finally {
        setLoading(false);
      }
    };

    // ONLY call the function if linkedUrl actually exists
    if (linkedUrl) {
      analyzeRepo();
    }
  }, [linkedUrl]); // The array tells React: "Re-run this effect if linkedUrl changes"

  const isAuthentic = data?.analysis?.status === 'Authentic';

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 pb-12">

      {/* Sleek Top Navigation (Search Bar Removed) */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <Activity className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Project-<span className="text-indigo-600">Verified</span>
            </h1>
          </div>

          <button
            onClick={onReset}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft size={16} /> New Audit
          </button>
        </div>
      </nav>

      {/* Loading State */}
      {loading && (
        <div className="max-w-2xl mx-auto mt-32 text-center px-4 animate-pulse">
          <div className="bg-indigo-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <Activity size={40} className="text-indigo-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Parsing Concrete Syntax Trees...</h2>
          <p className="text-slate-500 text-lg">
            Extracting mathematical semantics from {linkedUrl ? linkedUrl.split('/').pop() : 'repository'}          </p>
        </div>
      )}

      {/* Main Dashboard (Bento Grid Layout) */}
      {data && !loading && (
        <div className="max-w-7xl mx-auto px-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

            {/* HERO METRIC: Reward Score */}
            <div className={`md:col-span-4 rounded-3xl p-8 border flex flex-col justify-center relative overflow-hidden shadow-sm ${isAuthentic ? 'bg-white border-emerald-100' : 'bg-rose-50 border-rose-200'
              }`}>
              <div className="absolute -right-6 -top-6 opacity-5">
                <Fingerprint size={150} />
              </div>
              <p className="text-slate-500 font-semibold mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                <ShieldCheck size={16} className={isAuthentic ? "text-emerald-500" : "text-rose-500"} />
                Integrity Score
              </p>
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter mb-2">
                {data.analysis.rewardScore.toFixed(2)}
              </h2>
              <div className="flex items-center gap-3 mt-4">
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 ${isAuthentic ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                  {isAuthentic ? <CheckCircle size={16} /> : <Activity size={16} />}
                  {data.analysis.status}
                </span>
              </div>
            </div>

            {/* EVOLUTION PULSE GRAPH */}
            <div className="md:col-span-8 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="font-bold text-lg text-slate-800">Evolution Pulse</h3>
                <p className="text-sm text-slate-500">Current score is {data.analysis.rewardScore.toFixed(2)} over recent commits</p>              </div>
              <div className="flex-1 min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.pulseData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" activeDot={{ r: 6, fill: '#4f46e5' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TECHNICAL AUDIT: 3 Mini Cards */}
            <div className="md:col-span-4 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Old AST Nodes</p>
                <p className="text-3xl font-bold text-slate-800">{data.analysis.oldNodeCount}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl"><Layers className="text-slate-400" size={24} /></div>
            </div>

            <div className="md:col-span-4 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">New AST Nodes</p>
                <p className="text-3xl font-bold text-slate-800">{data.analysis.newNodeCount}</p>
              </div>
              <div className="bg-indigo-50 p-3 rounded-2xl"><Layers className="text-indigo-400" size={24} /></div>
            </div>

            <div className="md:col-span-4 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Zhang-Shasha Distance</p>
                <p className="text-3xl font-bold text-indigo-600">{data.analysis.editDistance}</p>
              </div>
              <div className="bg-indigo-100 p-3 rounded-2xl"><Cpu className="text-indigo-600" size={24} /></div>
            </div>

            {/* BOTTOM ROW: History and Raw Parser Output */}
            <div className="md:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
                <GitCommit className="text-indigo-600" size={20} /> Verified History Log
              </h3>
              <div className="space-y-4">
                {data.commits.map((commit, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                          {commit.sha}
                        </span>
                        <span className="text-xs font-medium text-slate-500">{commit.author}</span>
                      </div>
                      {/* SEMANTIC CLUSTERS */}
                      <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                        {Object.entries(data.clusters).map(([key, group]) => (
                          <div key={key} className={`bg-white rounded-3xl p-6 border shadow-sm border-l-8 flex flex-col ${key === 'authentic' ? 'border-l-emerald-500' :
                            key === 'standard' ? 'border-l-blue-500' : 'border-l-rose-500'
                            }`}>
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="font-bold text-slate-800">{group.label}</h4>
                              <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded-lg">
                                {group.commits.length} Commits
                              </span>
                            </div>
                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 flex-1">
                              {group.commits.length > 0 ? group.commits.map((c, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  <span className="font-mono font-bold text-slate-500">{c.sha}</span>
                                  <span className="text-slate-400 font-medium">r: {c.score}</span>
                                </div>
                              )) : (
                                <p className="text-xs text-slate-400 italic">No activity in this cluster.</p>
                              )}
                            </div>

                            {/* --- NEW: AI VIVA TRIGGER --- */}
                            {/* {key === 'suspect' && group.commits.length > 0 && (
                              <button
                                onClick={() => alert(`Starting AI Viva for commits: ${group.commits.map(c => c.sha).join(', ')}`)}
                                className="mt-4 w-full bg-rose-50 text-rose-600 border border-rose-200 py-2 rounded-xl text-sm font-bold hover:bg-rose-100 hover:text-rose-700 transition-all flex items-center justify-center gap-2"
                              >
                                <Terminal size={16} /> Initiate AI Viva
                              </button>
                            )} */}
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-slate-700 font-medium truncate max-w-md">{commit.message}</p>
                    </div>
                    <div className="mt-2 sm:mt-0 text-right">
                      <p className="text-xs text-slate-400 font-medium">
                        {new Date(commit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw Parser Output */}
            <div className="md:col-span-5 bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-800 flex flex-col">
              <h3 className="font-bold text-sm text-slate-300 mb-4 flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" /> Raw CST Fragment
              </h3>
              <div className="flex-1 bg-black/40 text-emerald-400/80 p-4 rounded-2xl font-mono text-[11px] overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
                {data.analysis.cst}
              </div>
            </div>
            {/* SEMANTIC CLUSTERS */}
            <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              {Object.entries(data.clusters).map(([key, group]) => (
                <div key={key} className={`bg-white rounded-3xl p-6 border shadow-sm border-l-8 ${key === 'authentic' ? 'border-l-emerald-500' :
                  key === 'standard' ? 'border-l-blue-500' : 'border-l-rose-500'
                  }`}>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-800">{group.label}</h4>
                    <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded-lg">
                      {group.commits.length} Commits
                    </span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                    {group.commits.length > 0 ? group.commits.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="font-mono font-bold text-slate-500">{c.sha}</span>
                        <span className="text-slate-400 font-medium">r: {c.score}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-400 italic">No activity in this cluster.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default GitPulseMVP;