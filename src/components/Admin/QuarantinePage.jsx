import React, { useEffect, useState } from 'react';
import './quarantine.css';

// Simple API helpers
const fetchQuarantine = async () => {
  const res = await fetch('http://localhost:5000/api/admin/quarantine');
  const json = await res.json();
  return json;
};

const promoteQuarantine = async (id) => {
  const res = await fetch(`http://localhost:5000/api/admin/quarantine/${id}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const json = await res.json();
  return json;
};

export default function QuarantinePage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuarantine();
      if (data.success) setQueue(data.queue || []);
      else setError(data.message || 'Failed to load queue');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handlePromote = async (id) => {
    if (!window.confirm('Promote this item to the trusted corpus?')) return;
    try {
      const result = await promoteQuarantine(id);
      if (result.success) {
        alert('Promotion queued successfully');
        loadQueue();
      } else {
        alert(`Error: ${result.message || 'Promotion failed'}`);
      }
    } catch (e) {
      alert(`Network error: ${e.message}`);
    }
  };

  return (
    <div className="quarantine-page glass-card">
      <h2 className="page-title">🔐 Quarantine Queue</h2>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      <table className="quarantine-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>File</th>
            <th>Source URL</th>
            <th>Reason</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.fileName}</td>
              <td><a href={item.sourceUrl} target="_blank" rel="noreferrer">Link</a></td>
              <td>{item.reason || 'N/A'}</td>
              <td>
                <button className="promote-button" onClick={() => handlePromote(item.id)}>
                  Promote
                </button>
              </td>
            </tr>
          ))}
          {queue.length === 0 && !loading && <tr><td colSpan="5" className="empty">No pending items</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
