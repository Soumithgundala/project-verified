import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, ShieldCheck, Terminal } from 'lucide-react';

const GitPulseMVP = ({ linkedUrl }) => {
  const [report, setReport] = useState(null);

  const runDummyAnalysis = () => {
    // Simulating semantic evolution analysis [cite: 16, 22]
    const dummyHistory = [
      { commit: 'Initial', score: 1.0 },
      { commit: 'Feature A', score: 0.92 },
      { commit: 'Core Logic', score: 0.35 }, // Simulated 'unnatural' evolution [cite: 30]
      { commit: 'Cleanup', score: 0.88 },
    ];
    setReport(dummyHistory);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-2xl shadow-sm border mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Activity /> Git-Pulse Status</h2>
          <p className="text-gray-400 text-sm truncate w-64">{linkedUrl}</p>
        </div>
        <button onClick={runDummyAnalysis} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">
          Run Integrity Scan
        </button>
      </div>

      {report && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <h3 className="font-bold mb-4">Semantic Evolution Pulse [cite: 15]</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="commit" />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 mt-4">Calculated using Tree Edit Distance (TED) proxy[cite: 22].</p>
        </div>
      )}
    </div>
  );
};

export default GitPulseMVP;