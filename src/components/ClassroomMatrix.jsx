import React, { useState, useRef } from 'react';
import {
    UploadCloud, Users, ShieldAlert, CheckCircle, Activity,
    ExternalLink, ArrowLeft, Download, X, Search, FileText
} from 'lucide-react';
import GitPulseMVP from './GitPulseMVP';
import html2pdf from 'html2pdf.js';

// Import modular CSS files
import './styles/MatrixShared.css';    // Shared buttons, badges, checkboxes
import './styles/MatrixGrid.css';      // The main landing/roster page
import './styles/MatrixWorkspace.css'; // The split-pane after-click page
import './styles/MatrixPDF.css';       // The hidden downloads/report builder

const ClassroomMatrix = ({ onReset }) => {
    const [students, setStudents] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [viewingStudent, setViewingStudent] = useState(null);
    const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
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
                    fullData: null
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
                        student.fullData = result;
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

    const toggleSelection = (id, e) => {
        if (e) e.stopPropagation();
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

    const triggerPDF = (filenameSuffix) => {
        setIsGeneratingBulk(true);
        setTimeout(() => {
            const element = bulkReportRef.current;
            const opt = {
                margin: 0.4,
                filename: `ProjectVerified_${filenameSuffix}_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 800 },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save().then(() => {
                setIsGeneratingBulk(false);
                setSelectedIds(new Set());
            });
        }, 800);
    };

    const handleDownloadSelected = () => triggerPDF('Selected_Reports');
    const handleDownloadAll = () => {
        const allCompletedIds = students.filter(s => s.scanStatus === 'complete').map(s => s.id);
        setSelectedIds(new Set(allCompletedIds));
        triggerPDF('Master_Cohort_Report');
    };

    const completedCount = students.filter(s => s.scanStatus === 'complete').length;
    const progressPercentage = students.length > 0 ? (progress.current / students.length) * 100 : 0;

    const filteredSidebarStudents = students.filter(s =>
        s.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        s.url.toLowerCase().includes(sidebarSearch.toLowerCase())
    );

    // ==========================================
    // RENDER: SPLIT PANE WORKSPACE (After Clicking)
    // ==========================================
    if (viewingStudent) {
        return (
            <div className="app-container workspace-view">
                <header className="workspace-header">
                    <div className="header-left">
                        <button onClick={() => setViewingStudent(null)} className="btn-back">
                            <ArrowLeft size={16} /> Back to Grid
                        </button>
                        <div className="header-divider"></div>
                        <h1 className="header-title">
                            <Activity size={18} className="icon-indigo" /> Deep Dive Analysis
                        </h1>
                    </div>
                    <div className="header-right">
                        <span className="selection-count">{selectedIds.size} selected for export</span>
                        <button onClick={handleDownloadSelected} disabled={selectedIds.size === 0 || isGeneratingBulk} className="btn-primary">
                            {isGeneratingBulk ? <Activity size={16} className="icon-spin" /> : <Download size={16} />}
                            {isGeneratingBulk ? "Building PDF..." : "Export Batch"}
                        </button>
                    </div>
                </header>

                <div className="workspace-body">
                    <main className="workspace-main custom-scrollbar">
                        <div className="report-content-wrapper">
                            <div className="report-student-header">
                                <div className="student-info">
                                    <h2>{viewingStudent.name}</h2>
                                    <a href={viewingStudent.url} target="_blank" rel="noreferrer" className="repo-link">
                                        {viewingStudent.url} <ExternalLink size={14} />
                                    </a>
                                </div>
                                <div className="student-score-block">
                                    <div className={`score-value ${viewingStudent.authenticity === 'Authentic' ? 'score-authentic' : 'score-suspect'}`}>
                                        {viewingStudent.score?.toFixed(2)}
                                    </div>
                                    <div className="score-label">Integrity Score</div>
                                </div>
                            </div>
                            <GitPulseMVP linkedUrl={viewingStudent.url} initialData={viewingStudent.fullData} isModalView={false} />
                        </div>
                    </main>

                    <aside className="workspace-sidebar">
                        <div className="sidebar-header">
                            <h3>Cohort Roster ({completedCount})</h3>
                            <div className="search-wrapper">
                                <Search size={14} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search by name..."
                                    value={sidebarSearch}
                                    onChange={(e) => setSidebarSearch(e.target.value)}
                                    className="search-input"
                                />
                            </div>
                        </div>
                        <div className="sidebar-list custom-scrollbar">
                            {filteredSidebarStudents.map(student => (
                                <div
                                    key={student.id}
                                    onClick={() => student.scanStatus === 'complete' && setViewingStudent(student)}
                                    className={`sidebar-card ${viewingStudent.id === student.id ? 'active' : ''} ${student.scanStatus !== 'complete' ? 'disabled' : ''}`}
                                >
                                    <div className="card-content">
                                        <div className="card-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(student.id)}
                                                onChange={(e) => toggleSelection(student.id, e)}
                                                disabled={student.scanStatus !== 'complete'}
                                                className="custom-checkbox small"
                                            />
                                        </div>
                                        <div className="card-details">
                                            <div className="card-top-row">
                                                <h4>{student.name}</h4>
                                                {student.score !== null && (
                                                    <span className={`mini-score ${student.authenticity === 'Authentic' ? 'mini-authentic' : 'mini-suspect'}`}>
                                                        {student.score.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="card-bottom-row">
                                                {student.scanStatus === 'complete' ? (
                                                    student.authenticity === 'Authentic'
                                                        ? <span className="status-text authentic"><CheckCircle size={10} /> Authentic</span>
                                                        : <span className="status-text suspect"><ShieldAlert size={10} /> Suspect</span>
                                                ) : (
                                                    <span className="status-text processing">Processing...</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredSidebarStudents.length === 0 && <div className="sidebar-empty">No students found.</div>}
                        </div>
                    </aside>
                </div>

                {/* PDF RENDERER (Duplicated to prevent mount/unmount loss) */}
                {/* PDF RENDERER (Detailed Forensic Report) */}
                <div className="pdf-hidden-container">
                    <div ref={bulkReportRef} className={`pdf-document ${isGeneratingBulk ? 'active' : ''}`}>

                        {/* Master Header */}
                        <div className="pdf-header">
                            <h1>Master Cohort Forensic Report</h1>
                            <p>Generated: {new Date().toLocaleString()}</p>
                            <p>Total Records: {selectedIds.size}</p>
                        </div>

                        {/* Render Each Student's Full Report */}
                        {students.filter(s => selectedIds.has(s.id)).map(student => {
                            if (!student.fullData) return null;

                            const d = student.fullData.analysis || {};
                            const commits = student.fullData.commits || [];
                            const rawCst = student.fullData.rawCst || "(ERROR (jsx_opening_element name: (identifier)... [Data Truncated])";

                            return (
                                <div key={student.id} className="pdf-page-break">

                                    {/* Student Header */}
                                    <div className="pdf-student-header">
                                        <div className="pdf-student-info">
                                            <h2 className="pdf-title">Forensic Integrity Report</h2>
                                            <p className="pdf-name">{student.name}</p>
                                            <p className="pdf-url">Repository: {student.url}</p>
                                        </div>
                                        <div className="pdf-student-score">
                                            <h3>{d.rewardScore?.toFixed(2) || '0.00'}</h3>
                                            <p className={student.authenticity === 'Authentic' ? 'pdf-authentic' : 'pdf-suspect'}>
                                                {student.authenticity?.toUpperCase() || 'UNKNOWN'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Core Metrics Table */}
                                    <div className="pdf-section">
                                        <table className="pdf-table">
                                            <thead>
                                                <tr>
                                                    <th>OLD AST NODES</th>
                                                    <th>NEW AST NODES</th>
                                                    <th>ZHANG-SHASHA DISTANCE</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="pdf-large-num">{d.oldNodeCount || '0'}</td>
                                                    <td className="pdf-large-num">{d.newNodeCount || '0'}</td>
                                                    <td className="pdf-large-num">{d.editDistance || '0'}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Commit Audit Log */}
                                    <div className="pdf-section">
                                        <h3 className="pdf-section-title">Complete Audit Log</h3>
                                        <table className="pdf-table pdf-commit-table">
                                            <thead>
                                                <tr>
                                                    <th>Commit SHA</th>
                                                    <th>Date</th>
                                                    <th>Message</th>
                                                    <th style={{ textAlign: 'right' }}>Score</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {commits.map(commit => (
                                                    <tr key={commit.sha}>
                                                        <td className="pdf-mono">{commit.sha.substring(0, 7)}</td>
                                                        <td>{commit.date || 'Unknown'}</td>
                                                        <td>{commit.message}</td>
                                                        <td style={{
                                                            textAlign: 'right',
                                                            fontWeight: 'bold',
                                                            color: commit.score < 0.45 ? '#be123c' : 'inherit'
                                                        }}>
                                                            r: {commit.score?.toFixed(2) || '0.00'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {commits.length === 0 && (
                                                    <tr><td colSpan="4" style={{ textAlign: 'center' }}>No commit data available.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Raw CST Fragment */}
                                    <div className="pdf-section">
                                        <h3 className="pdf-section-title">Raw CST Fragment</h3>
                                        <div className="pdf-code-block">
                                            {rawCst.substring(0, 800)}{rawCst.length > 800 ? '...' : ''}
                                        </div>
                                    </div>

                                </div>
                            )
                        })}

                        {/* Master Appendix (Attached to the end of the batch) */}
                        {selectedIds.size > 0 && (
                            <div className="pdf-page-break">
                                <div className="pdf-appendix">
                                    <h2>Appendix: Understanding the Metrics</h2>

                                    <h4>1. What are AST Nodes? (Old vs. New)</h4>
                                    <p>An Abstract Syntax Tree (AST) is a mathematical representation of the code's structure. Old AST Nodes represent the codebase before the commit. New AST Nodes represent the complexity after the commit. Comparing them analyzes structural growth.</p>

                                    <h4>2. How is the Integrity Score Calculated?</h4>
                                    <p>The engine uses the Zhang-Shasha algorithm to calculate the Tree Edit Distance (the minimum number of steps to transform the Old AST into the New AST). The Integrity Score (r) evaluates this distance over time. High injection of code without gradual human edits results in a low score.</p>

                                    <h4>3. What is considered a Good Score?</h4>
                                    <ul>
                                        <li><strong>0.85 - 1.00 (Authentic):</strong> Indicates steady, human-paced development and careful refactoring.</li>
                                        <li><strong>0.45 - 0.84 (Standard):</strong> Normal feature additions and expected structural modifications.</li>
                                        <li><strong>0.00 - 0.44 (Suspect):</strong> Anomalous "High-Velocity Dumps." Often indicates pasting large AI-generated blocks.</li>
                                    </ul>

                                    <h4>4. How to read the Raw CST Fragment?</h4>
                                    <p>The Concrete Syntax Tree (CST) fragment is the raw grammar output generated by our parsers. It acts as the immutable data source to calculate the edit distance.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    // RENDER: MAIN GRID VIEW (Landing Page)
    // ==========================================
    return (
        <div className="app-container grid-view">
            <nav className="main-nav">
                <div className="nav-content">
                    <div className="nav-logo">
                        <div className="logo-icon"><Users size={20} /></div>
                        <h1>Cohort<span>Matrix</span></h1>
                    </div>
                    <button onClick={onReset} className="btn-text">
                        <ArrowLeft size={16} className="arrow-icon" /> Back to Single Audit
                    </button>
                </div>
            </nav>

            <div className="grid-content-wrapper">
                {students.length === 0 && (
                    <div className="upload-container">
                        <div className="upload-icon-wrapper"><UploadCloud size={32} /></div>
                        <h2>Import Class Roster</h2>
                        <p>Upload a <strong>.csv</strong> file containing Student Names and their GitHub Repository URLs.</p>
                        <label className="btn-upload">
                            <span>Select CSV File</span>
                            <input type="file" accept=".csv" onChange={handleFileUpload} />
                        </label>
                    </div>
                )}

                {students.length > 0 && (
                    <div className="table-section fade-in">
                        <div className="table-header-block">
                            <div className="table-titles">
                                <h2>Project Validation Grid</h2>
                                <p>Analyzing {students.length} repositories</p>
                            </div>
                            {!isProcessing && completedCount > 0 && (
                                <button onClick={handleDownloadAll} disabled={isGeneratingBulk} className="btn-secondary">
                                    {isGeneratingBulk ? <Activity size={16} className="icon-spin" /> : <FileText size={16} />}
                                    {isGeneratingBulk ? "Building..." : "Export Full Roster"}
                                </button>
                            )}
                        </div>

                        {isProcessing && (
                            <div className="progress-container">
                                <div className="progress-text">
                                    <span><Activity size={16} className="icon-spin icon-indigo" /> Scanning repositories...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }}></div>
                                </div>
                            </div>
                        )}

                        <div className="table-container custom-scrollbar">
                            <table className="matrix-table">
                                <thead>
                                    <tr>
                                        <th className="th-checkbox">
                                            <input type="checkbox" onChange={toggleAll} checked={selectedIds.size === completedCount && students.length > 0} className="custom-checkbox" disabled={isProcessing} />
                                        </th>
                                        <th>Student Name</th>
                                        <th>Repository</th>
                                        <th className="align-center">Status</th>
                                        <th className="align-center">Score</th>
                                        <th className="align-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((student) => (
                                        <tr key={student.id} className={`matrix-row ${selectedIds.has(student.id) ? 'selected' : ''}`} onClick={() => student.scanStatus === 'complete' && setViewingStudent(student)}>
                                            <td className="td-checkbox" onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedIds.has(student.id)} onChange={(e) => toggleSelection(student.id, e)} disabled={student.scanStatus !== 'complete'} className="custom-checkbox" />
                                            </td>
                                            <td className="td-name">{student.name}</td>
                                            <td className="td-repo" onClick={(e) => e.stopPropagation()}>
                                                <a href={student.url} target="_blank" rel="noreferrer" className="repo-link">
                                                    {student.url.split('/').slice(-2).join('/')} <ExternalLink size={14} className="hover-icon" />
                                                </a>
                                            </td>
                                            <td className="td-status align-center">
                                                {student.scanStatus === 'pending' && <span className="badge badge-waiting">Waiting</span>}
                                                {student.scanStatus === 'scanning' && <span className="badge badge-parsing"><span className="pulse-dot"></span> Parsing</span>}
                                                {student.scanStatus === 'failed' && <span className="badge badge-error">Error</span>}
                                                {student.scanStatus === 'complete' && (
                                                    student.authenticity === 'Authentic'
                                                        ? <span className="badge badge-authentic"><span className="status-dot green"></span> Authentic</span>
                                                        : <span className="badge badge-suspect"><span className="status-dot orange"></span> Suspect</span>
                                                )}
                                            </td>
                                            <td className="td-score align-center">
                                                {student.score !== null ? (
                                                    <span className={`score-pill ${student.authenticity === 'Authentic' ? 'pill-gray' : 'pill-orange'}`}>
                                                        {student.score.toFixed(2)}
                                                    </span>
                                                ) : <span className="score-empty">-</span>}
                                            </td>
                                            <td className="td-action align-right">
                                                <button onClick={(e) => { e.stopPropagation(); setViewingStudent(student); }} disabled={student.scanStatus !== 'complete'} className="btn-action">
                                                    Open Analysis <ArrowLeft size={14} className="icon-flip" />
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

            {/* FLOATING ACTION BAR */}
            <div className={`floating-action-bar ${selectedIds.size > 0 ? 'visible' : ''}`}>
                <div className="fab-content">
                    <div className="fab-count-group">
                        <div className="fab-count">{selectedIds.size}</div>
                        <span>Selected</span>
                    </div>
                    <div className="fab-divider"></div>
                    <button onClick={handleDownloadSelected} disabled={isGeneratingBulk} className="btn-fab-primary">
                        {isGeneratingBulk ? <Activity size={16} className="icon-spin" /> : <Download size={16} />}
                        {isGeneratingBulk ? "Generating PDF..." : "Download Selected"}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="btn-fab-close"><X size={16} /></button>
                </div>
            </div>

            {/* PDF RENDERER (Detailed Forensic Report) */}
            <div className="pdf-hidden-container">
                <div ref={bulkReportRef} className={`pdf-document ${isGeneratingBulk ? 'active' : ''}`}>

                    {/* Master Header */}
                    <div className="pdf-header">
                        <h1>Master Cohort Forensic Report</h1>
                        <p>Generated: {new Date().toLocaleString()}</p>
                        <p>Total Records: {selectedIds.size}</p>
                    </div>

                    {/* NEW: Executive Summary Table on Page 1 */}
                    {selectedIds.size > 0 && (
                        <div className="pdf-summary-section">
                            <h3 className="pdf-section-title">Executive Summary</h3>
                            {/* ADDED 'summary-table' CLASS */}
                            <table className="pdf-table summary-table">
                                <thead>
                                    <tr>
                                        <th>Student Name</th>
                                        <th>Project Repository</th>
                                        <th style={{ textAlign: 'right' }}>Integrity Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.filter(s => selectedIds.has(s.id)).map(student => (
                                        <tr key={`summary-${student.id}`}>
                                            <td style={{ fontWeight: 'bold', color: '#0f172a' }}>{student.name}</td>
                                            <td className="pdf-mono">{student.url.split('/').pop()}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }} className={student.authenticity === 'Authentic' ? 'pdf-authentic' : 'pdf-suspect'}>
                                                {student.score !== null ? student.score.toFixed(2) : 'N/A'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Render Each Student's Full Report (Starts on Page 2) */}
                    <div className="pdf-detailed-reports">
                        {students.filter(s => selectedIds.has(s.id)).map(student => {
                            if (!student.fullData) return null;

                            const d = student.fullData.analysis || {};
                            const commits = student.fullData.commits || [];
                            const rawCst = student.fullData.rawCst || "(ERROR (jsx_opening_element name: (identifier)... [Data Truncated])";

                            return (
                                <div key={student.id} className="pdf-page-break">

                                    {/* Student Header */}
                                    <div className="pdf-student-header">
                                        <div className="pdf-student-info">
                                            <h2 className="pdf-title">Forensic Integrity Report</h2>
                                            <p className="pdf-name">{student.name}</p>
                                            <p className="pdf-url">Repository: {student.url}</p>
                                        </div>
                                        <div className="pdf-student-score" style={{ textAlign: 'right' }}>
                                            <p className="pdf-title" style={{ marginBottom: '4px', color: '#64748b' }}>Integrity Score</p>
                                            <h3>{d.rewardScore?.toFixed(2) || '0.00'}</h3>
                                            <p className={student.authenticity === 'Authentic' ? 'pdf-authentic' : 'pdf-suspect'}>
                                                {student.authenticity?.toUpperCase() || 'UNKNOWN'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Core Metrics Table */}
                                    <div className="pdf-section">
                                        <table className="pdf-table">
                                            <thead>
                                                <tr>
                                                    <th>OLD AST NODES</th>
                                                    <th>NEW AST NODES</th>
                                                    <th>ZHANG-SHASHA DISTANCE</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="pdf-large-num">{d.oldNodeCount || '0'}</td>
                                                    <td className="pdf-large-num">{d.newNodeCount || '0'}</td>
                                                    <td className="pdf-large-num">{d.editDistance || '0'}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Commit Audit Log */}
                                    <div className="pdf-section">
                                        <h3 className="pdf-section-title">Complete Audit Log</h3>
                                        <table className="pdf-table pdf-commit-table">
                                            <thead>
                                                <tr>
                                                    <th>Commit SHA</th>
                                                    <th>Date</th>
                                                    <th>Message</th>
                                                    <th style={{ textAlign: 'right' }}>Score</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {commits.map(commit => (
                                                    <tr key={commit.sha}>
                                                        <td className="pdf-mono">{commit.sha.substring(0, 7)}</td>
                                                        <td>{commit.date || 'Unknown'}</td>
                                                        <td className="pdf-wrap-text">{commit.message}</td>
                                                        <td style={{
                                                            textAlign: 'right',
                                                            fontWeight: 'bold',
                                                            color: commit.score < 0.45 ? '#be123c' : 'inherit'
                                                        }}>
                                                            r: {commit.score?.toFixed(2) || '0.00'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {commits.length === 0 && (
                                                    <tr><td colSpan="4" style={{ textAlign: 'center' }}>No commit data available.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Raw CST Fragment */}
                                    <div className="pdf-section">
                                        <h3 className="pdf-section-title">Raw CST Fragment</h3>
                                        <div className="pdf-code-block">
                                            {rawCst.substring(0, 800)}{rawCst.length > 800 ? '...' : ''}
                                        </div>
                                    </div>

                                </div>
                            )
                        })}
                    </div>

                    {/* Master Appendix (Attached to the end of the batch) */}
                    {selectedIds.size > 0 && (
                        <div className="pdf-page-break">
                            <div className="pdf-appendix">
                                <h2>Appendix: Understanding the Metrics</h2>

                                <h4>1. What are AST Nodes? (Old vs. New)</h4>
                                <p>An Abstract Syntax Tree (AST) is a mathematical representation of the code's structure. Old AST Nodes represent the codebase before the commit. New AST Nodes represent the complexity after the commit. Comparing them analyzes structural growth.</p>

                                <h4>2. How is the Integrity Score Calculated?</h4>
                                <p>The engine uses the Zhang-Shasha algorithm to calculate the Tree Edit Distance (the minimum number of steps to transform the Old AST into the New AST). The Integrity Score (r) evaluates this distance over time. High injection of code without gradual human edits results in a low score.</p>

                                <h4>3. What is considered a Good Score?</h4>
                                <ul>
                                    <li><strong>0.85 - 1.00 (Authentic):</strong> Indicates steady, human-paced development and careful refactoring.</li>
                                    <li><strong>0.45 - 0.84 (Standard):</strong> Normal feature additions and expected structural modifications.</li>
                                    <li><strong>0.00 - 0.44 (Suspect):</strong> Anomalous "High-Velocity Dumps." Often indicates pasting large AI-generated blocks.</li>
                                </ul>

                                <h4>4. How to read the Raw CST Fragment?</h4>
                                <p>The Concrete Syntax Tree (CST) fragment is the raw grammar output generated by our parsers. It acts as the immutable data source to calculate the edit distance.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClassroomMatrix;