import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, CheckCircle, Terminal, GitCommit, GitBranch } from 'lucide-react';

const GitPulseMVP = ({ linkedUrl }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    // Automatically trigger analysis when the component mounts with a URL
    if (linkedUrl && !data) {
      analyzeRepo();
    }
  }, [linkedUrl, data]);

  const analyzeRepo = async () => {
    if (!linkedUrl) return;
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/link-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkedUrl }),
      });
      const result = await response.json();
      if (result.success) {
        setData(result);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Loading State */}
        {loading && !data && (
          <div className="text-center py-32 flex flex-col items-center animate-in fade-in duration-500">
            <Activity className="animate-spin text-indigo-600 mb-6" size={56} />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Analyzing Repository</h2>
            <p className="text-slate-500">Running semantic Concrete Syntax Tree (CST) audit...</p>
          </div>
        )}

        {/* Empty / Error State */}
        {!data && !loading && (
          <div className="text-center py-20 text-slate-400">
            <GitBranch size={48} className="mx-auto mb-4 opacity-20" />
            <p>No data available or analysis failed for this repository.</p>
          </div>
        )}

        {/* Data Dashboard */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

            {/* Main Pulse Chart */}
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                    Evolution Pulse
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Reward Score (r) across commits</p>
                </div>
                <div className={`px-5 py-2 rounded-full text-sm font-bold border flex items-center gap-2 ${data.analysis.status === 'Authentic'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                  <span className="relative flex h-3 w-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${data.analysis.status === 'Authentic' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${data.analysis.status === 'Authentic' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </span>
                  {data.analysis.status}
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={[
                    { name: 'Previous', score: 1.0 },
                    { name: 'Latest Commit', score: data.analysis.rewardScore }
                  ]}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} stroke="#94a3b8" tick={{ fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                      activeDot={{ r: 8, strokeWidth: 0, fill: '#4f46e5' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Integrity Metrics Sidebar */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500 rounded-full blur-3xl opacity-20"></div>

                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 relative z-10">
                  <ShieldCheck className="text-indigo-400" /> Technical Audit
                </h3>

                <div className="space-y-5 relative z-10">
                  <div className="flex justify-between items-end border-b border-slate-700/50 pb-3">
                    <span className="text-slate-400 text-sm">Zhang-Shasha Distance</span>
                    <span className="font-mono text-2xl font-bold text-indigo-300">{data.analysis.editDistance}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-slate-700/50 pb-3">
                    <span className="text-slate-400 text-sm">Old AST Nodes</span>
                    <span className="font-mono text-xl">{data.analysis.oldNodeCount}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-slate-400 text-sm">New AST Nodes</span>
                    <span className="font-mono text-xl">{data.analysis.newNodeCount}</span>
                  </div>
                </div>
              </div>

              {/* Raw CST Output */}
              <div className="bg-slate-900 p-6 rounded-3xl shadow-lg border border-slate-800">
                <h3 className="font-bold text-sm text-slate-300 mb-4 flex items-center gap-2">
                  <Terminal size={16} className="text-emerald-400" /> Parser Output (CST)
                </h3>
                <div className="bg-black/50 text-emerald-400/80 p-4 rounded-xl font-mono text-xs h-32 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                  {data.analysis.cst}
                </div>
              </div>
            </div>

            {/* Commit Timeline View */}
            <div className="lg:col-span-3 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 mt-4">
              <h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2">
                <GitCommit className="text-indigo-600" /> Verified History Log
              </h3>
              <div className="relative border-l-2 border-slate-100 ml-4 space-y-8">
                {data.commits.map((commit, i) => (
                  <div key={i} className="relative pl-8">
                    {/* Timeline dot */}
                    <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-white border-4 border-indigo-500"></div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                            {commit.sha}
                          </span>
                          <span className="text-xs font-semibold text-slate-400 bg-slate-200 px-2 py-1 rounded-full">
                            {commit.author}
                          </span>
                        </div>
                        <p className="text-slate-700 font-medium">{commit.message}</p>
                      </div>
                      <div className="mt-2 md:mt-0 flex items-center gap-2 text-right">
                        <span className="text-sm font-medium text-slate-500">
                          {new Date(commit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <CheckCircle size={18} className="text-emerald-500" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitPulseMVP;