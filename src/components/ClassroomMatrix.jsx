import React, { useState, useRef } from 'react';
import { UploadCloud, Users, ShieldAlert, CheckCircle, Activity, ExternalLink, ArrowLeft, Download, Eye, X } from 'lucide-react';
import GitPulseMVP from './GitPulseMVP';
import html2pdf from 'html2pdf.js';

const ClassroomMatrix = ({ onReset }) => {
    const [students, setStudents] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    // NEW STATES
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewingStudent, setViewingStudent] = useState(null);
    const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
    const bulkReportRef = useRef();

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const rows = text.split('\n').filter(row => row.trim().length > 0);

            const parsedStudents = rows.slice(1).map((row, index) => {
                const [name, url] = row.split(',');
                return {
                    id: index,
                    name: name?.trim() || 'Unknown Student',
                    url: url?.trim() || '',
                    scanStatus: 'pending',
                    score: null,
                    authenticity: null,
                    fullData: null // Store complete API response here
                };
            }).filter(s => s.url.includes('github.com'));

            setStudents(parsedStudents);
            processCohort(parsedStudents);
        };
        reader.readAsText(file);
    };

    const processCohort = async (cohort) => {
        setIsProcessing(true);
        setProgress({ current: 0, total: cohort.length });
        const updatedCohort = [...cohort];

        for (let i = 0; i < updatedCohort.length; i++) {
            const student = updatedCohort[i];
            student.scanStatus = 'scanning';
            setStudents([...updatedCohort]);

            try {
                const response = await fetch('http://localhost:5000/api/link-repo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: student.url }),
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        student.score = result.analysis.rewardScore;
                        student.authenticity = result.analysis.status;
                        student.fullData = result; // Save the massive payload
                        student.scanStatus = 'complete';
                    } else {
                        student.scanStatus = 'failed';
                    }
                } else {
                    student.scanStatus = 'failed';
                }
            } catch (err) {
                student.scanStatus = 'failed';
            }
            setProgress({ current: i + 1, total: cohort.length });
            setStudents([...updatedCohort]);
        }
        setIsProcessing(false);
    };

    // CHECKBOX LOGIC
    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === students.filter(s => s.scanStatus === 'complete').length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(students.filter(s => s.scanStatus === 'complete').map(s => s.id)));
        }
    };

    // MASTER PDF GENERATOR
    const handleBulkDownload = () => {
        setIsGeneratingBulk(true);

        // Give the off-screen DOM time to render the selected reports
        setTimeout(() => {
            const element = bulkReportRef.current;
            const opt = {
                margin: 0.4,
                filename: `ProjectVerified_MasterCohortReport_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 1000 },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                setIsGeneratingBulk(false);
                setSelectedIds(new Set()); // clear selection after download
            });
        }, 800);
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 pb-12">

            <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 p-2 rounded-xl"><Users className="text-white" size={24} /></div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Cohort<span className="text-indigo-600">Matrix</span></h1>
                    </div>
                    <button onClick={onReset} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors">
                        <ArrowLeft size={16} /> Back to Single Audit
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 mt-8 relative">

                {/* Upload Screen */}
                {students.length === 0 && (
                    <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-16 text-center mt-12 hover:border-indigo-500 transition-colors">
                        <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <UploadCloud size={32} className="text-indigo-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Class Roster (.csv)</h2>
                        <p className="text-slate-500 mb-8 max-w-md mx-auto">Upload a CSV file with two columns: <strong>Student Name</strong> and <strong>GitHub URL</strong>.</p>
                        <label className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-slate-800 transition-colors shadow-sm">
                            Select CSV File
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                )}

                {/* Data Table */}
                {students.length > 0 && (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">

                        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Classroom Integrity Report</h2>
                                <p className="text-sm text-slate-500">Processing {students.length} repositories</p>
                            </div>

                            {/* ACTION BAR (Appears when items are selected) */}
                            {selectedIds.size > 0 && !isProcessing && (
                                <div className="flex items-center gap-4 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                                    <span className="text-sm font-bold text-indigo-700">{selectedIds.size} Selected</span>
                                    <button
                                        onClick={handleBulkDownload}
                                        disabled={isGeneratingBulk}
                                        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isGeneratingBulk ? <Activity size={14} className="animate-spin" /> : <Download size={14} />}
                                        {isGeneratingBulk ? "Building Master PDF..." : "Download Master PDF"}
                                    </button>
                                </div>
                            )}

                            {isProcessing && (
                                <div className="flex items-center gap-4 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm">
                                    <Activity size={16} className="animate-spin" /> Scanning: {progress.current} / {progress.total}
                                </div>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white border-b-2 border-slate-100 text-slate-500 text-sm tracking-wide">
                                        <th className="py-4 px-6 w-12">
                                            <input
                                                type="checkbox"
                                                onChange={toggleAll}
                                                checked={selectedIds.size === students.filter(s => s.scanStatus === 'complete').length && students.length > 0}
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                disabled={isProcessing}
                                            />
                                        </th>
                                        <th className="py-4 px-4 font-bold">Student Name</th>
                                        <th className="py-4 px-4 font-bold">Repository</th>
                                        <th className="py-4 px-4 font-bold text-center">Status</th>
                                        <th className="py-4 px-4 font-bold text-center">Integrity Score</th>
                                        <th className="py-4 px-6 font-bold text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {students.map((student) => (
                                        <tr key={student.id} className={`transition-colors ${selectedIds.has(student.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>

                                            <td className="py-4 px-6">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(student.id)}
                                                    onChange={() => toggleSelection(student.id)}
                                                    disabled={student.scanStatus !== 'complete'}
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                                />
                                            </td>

                                            <td className="py-4 px-4 font-bold text-slate-800">{student.name}</td>

                                            <td className="py-4 px-4">
                                                <a href={student.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-sm font-mono truncate max-wxs">
                                                    {student.url.split('/').slice(-2).join('/')} <ExternalLink size={12} />
                                                </a>
                                            </td>

                                            <td className="py-4 px-4 text-center">
                                                {student.scanStatus === 'pending' && <span className="inline-flex text-slate-400 text-xs font-bold items-center gap-1">Waiting...</span>}
                                                {student.scanStatus === 'scanning' && <span className="inline-flex text-blue-600 text-xs font-bold items-center gap-1"><Activity size={12} className="animate-spin" /> Parsing</span>}
                                                {student.scanStatus === 'failed' && <span className="inline-flex text-rose-500 text-xs font-bold">Error</span>}
                                                {student.scanStatus === 'complete' && (
                                                    student.authenticity === 'Authentic'
                                                        ? <span className="inline-flex bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold items-center gap-1"><CheckCircle size={12} /> Authentic</span>
                                                        : <span className="inline-flex bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold items-center gap-1"><ShieldAlert size={12} /> Suspect</span>
                                                )}
                                            </td>

                                            {/* Clicking the score also opens the modal */}
                                            <td className="py-4 px-4 text-center cursor-pointer group" onClick={() => student.scanStatus === 'complete' && setViewingStudent(student)}>
                                                {student.score !== null ? (
                                                    <span className={`text-xl font-black group-hover:underline ${student.authenticity === 'Authentic' ? 'text-slate-800' : 'text-rose-600'}`}>
                                                        {student.score.toFixed(2)}
                                                    </span>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>

                                            <td className="py-4 px-6 text-right">
                                                <button
                                                    onClick={() => setViewingStudent(student)}
                                                    disabled={student.scanStatus !== 'complete'}
                                                    className="text-indigo-600 font-bold text-sm flex items-center gap-1 ml-auto hover:text-indigo-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <Eye size={16} /> View
                                                </button>
                                            </td>

                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                )}
            </div>

            {/* =========================================================
          FEATURE 1: FULL SCREEN REPORT MODAL 
      ========================================================= */}
            {viewingStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-6">
                    <div className="bg-white w-full max-w-7xl h-[90vh] rounded-3xl overflow-hidden relative flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                            <h2 className="font-bold flex items-center gap-2"><Activity size={18} /> Student Report: {viewingStudent.name}</h2>
                            <button onClick={() => setViewingStudent(null)} className="hover:bg-slate-800 p-2 rounded-full transition-colors text-slate-300 hover:text-white"><X size={20} /></button>
                        </div>
                        {/* Modal Body (Reuses the GitPulseMVP component flawlessly by passing initialData!) */}
                        <div className="overflow-y-auto flex-1 bg-[#F8FAFC]">
                            <GitPulseMVP
                                linkedUrl={viewingStudent.url}
                                initialData={viewingStudent.fullData}
                                isModalView={true}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
          FEATURE 2: HIDDEN MASTER PDF RENDERER (Bulk Export)
          This renders a fast, text-based forensic report for all selected students 
          off-screen so html2canvas can capture it as one continuous document.
      ========================================================= */}
            <div style={{ position: 'fixed', top: '-10000px', left: 0, zIndex: -1 }}>
                <div ref={bulkReportRef} style={{ display: isGeneratingBulk ? 'block' : 'none', width: '900px', background: 'white', padding: '40px', color: 'black', fontFamily: 'sans-serif' }}>

                    {/* Cover Page */}
                    <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '20px', marginBottom: '30px' }}>
                        <h1 style={{ fontSize: '32px', margin: '0 0 10px 0', color: '#0f172a' }}>Master Cohort Forensic Report</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Generated: {new Date().toLocaleString()}</p>
                        <p style={{ margin: 0, color: '#64748b' }}>Total Records: {selectedIds.size}</p>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', marginBottom: '40px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', color: '#64748b' }}>
                                <th style={{ padding: '12px', borderBottom: '2px solid #0f172a' }}>Student Name</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid #0f172a' }}>Repository</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid #0f172a' }}>Status</th>
                                <th style={{ padding: '12px', borderBottom: '2px solid #0f172a', textAlign: 'right' }}>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.filter(s => selectedIds.has(s.id)).map(s => (
                                <tr key={s.id}>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold' }}>{s.name}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{s.url.split('/').pop()}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', color: s.authenticity === 'Authentic' ? '#10b981' : '#f43f5e', fontWeight: 'bold' }}>{s.authenticity}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>{s.score?.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Individual Student Breakdown (Page Breaks automatically added by the generator) */}
                    {students.filter(s => selectedIds.has(s.id)).map(student => {
                        const d = student.fullData.analysis;
                        return (
                            <div key={student.id} style={{ pageBreakBefore: 'always', paddingTop: '20px' }}>

                                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div>
                                        <h2 style={{ fontSize: '24px', margin: '0 0 5px 0', color: '#0f172a' }}>{student.name}</h2>
                                        <p style={{ margin: 0, color: '#64748b', fontFamily: 'monospace' }}>{student.url}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <h3 style={{ fontSize: '32px', margin: 0, color: '#0f172a', lineHeight: '1' }}>{d.rewardScore.toFixed(2)}</h3>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: student.authenticity === 'Authentic' ? '#10b981' : '#f43f5e' }}>{student.authenticity.toUpperCase()}</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '30px', marginBottom: '30px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                    <div><p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>OLD AST</p><p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{d.oldNodeCount}</p></div>
                                    <div><p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>NEW AST</p><p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{d.newNodeCount}</p></div>
                                    <div><p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>ZHANG-SHASHA</p><p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#4f46e5' }}>{d.editDistance}</p></div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f8fafc' }}>
                                            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Commit</th>
                                            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Message</th>
                                            <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.fullData.commits.map(c => (
                                            <tr key={c.sha}>
                                                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace', color: '#4f46e5' }}>{c.sha}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{c.message.substring(0, 50)}{c.message.length > 50 ? '...' : ''}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 'bold', color: c.score < 0.45 ? '#be123c' : 'inherit' }}>{c.score}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    })}

                </div>
            </div>

        </div>
    );
};

export default ClassroomMatrix;