import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import '../styles/GitPulse/GitPulsePdfReport.css';

const GitPulsePdfReport = ({ data, linkedUrl, isAuthentic, isPrinting }) => {
  const evidenceReport = data.evidenceReport;
  const humanOverrides = data.humanOverrides || [];
  const parserDiagnostics = data.analysis?.parserDiagnostics;
  const hasParseFailure = parserDiagnostics?.status === 'severe_parse_failure' ||
    parserDiagnostics?.status === 'degraded_line_fallback' ||
    parserDiagnostics?.status === 'fragment_recovered' ||
    data.analysis?.cst?.includes('(ERROR)') ||
    data.analysis?.cst?.includes('Parser degradation detected') ||
    data.intelligence?.globalOriginality?.status?.includes('Parsing Failure');
  const hasFallbackFailure = (data.matrix || []).some(row =>
    row.status.includes('Parsing Failure') || row.status.includes('Fallback Failure')
  );
  const zeroMatchState = evidenceReport?.totalMatchedFingerprints === 0;
  const evidenceGateLabel = evidenceReport?.minimumEvidenceThreshold
    ? `${evidenceReport.totalMatchedFingerprints || 0} / ${evidenceReport.minimumEvidenceThreshold} fingerprints`
    : `${evidenceReport?.totalMatchedFingerprints || 0} fingerprints`;

  const buildEvidenceHeadline = () => {
    if (!evidenceReport) return null;
    if (zeroMatchState) {
      return hasParseFailure || hasFallbackFailure
        ? 'No forensic receipts were produced. The current report is parser-degraded, so zero matches should be treated as inconclusive rather than clean.'
        : 'No forensic receipts were produced. The current corpus comparison found zero structural overlaps in the analyzed files.';
    }
    if (evidenceReport.plagiarismType === 'LOW_CONFIDENCE') {
      return `Some structural overlap was found, but only ${evidenceGateLabel} passed into the evidence gates, so the system withheld a plagiarism classification.`;
    }
    return null;
  };

  const buildClassificationExplanation = () => {
    if (!evidenceReport) return null;
    if (zeroMatchState) return null;
    const dominant = evidenceReport.sources?.[0];
    const largestSegment = dominant?.topSegments?.reduce((max, segment) => {
      const count = segment.fingerprintCount || 0;
      return count > (max.fingerprintCount || 0) ? segment : max;
    }, {}) || {};

    if (evidenceReport.plagiarismType === 'BOILERPLATE_HEAVY') {
      return 'Low-trust boilerplate matches were suppressed from primary classification.';
    }

    if (evidenceReport.plagiarismType === 'LOW_CONFIDENCE') {
      return `Evidence gate status: ${evidenceGateLabel}. ${evidenceReport.rejectionReason || 'The overlap signal was too weak or fragmented to classify.'}`;
    }

    const largestSegmentText = largestSegment.fingerprintCount
      ? `Largest coherent segment contains ${largestSegment.fingerprintCount} fingerprints.`
      : 'No coherent segment exceeded the receipt display threshold.';
    return `Project containment reached ${evidenceReport.projectContainment}%. Dominant source contributed ${evidenceReport.dominanceScore}% of ranked evidence. ${largestSegmentText}`;
  };

  return (
    <div className={`pdf-container ${isPrinting ? 'is-printing' : ''}`}>
      <div className="pdf-header">
        <div>
          <h1 className="pdf-title">Forensic Integrity Report</h1>
          <p className="pdf-subtitle">Repository: <strong>{linkedUrl}</strong></p>
          <p className="pdf-subtitle">Generated: <strong>{new Date().toLocaleString()}</strong></p>
        </div>
        <div className="pdf-score-wrapper">
          <p className="pdf-score-label">Integrity Score</p>
          <h2 className="pdf-score-value">{data.analysis.rewardScore.toFixed(2)}</h2>
          <span className={`pdf-status-badge ${isAuthentic ? 'authentic' : 'warning'}`}>
            {data.analysis.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="pdf-stats-row">
        <div className="pdf-stat-item">
          <p className="pdf-stat-label">Old AST Nodes</p>
          <p className="pdf-stat-value">{data.analysis.oldNodeCount}</p>
        </div>
        <div className="pdf-stat-item">
          <p className="pdf-stat-label">New AST Nodes</p>
          <p className="pdf-stat-value">{data.analysis.newNodeCount}</p>
        </div>
        <div className="pdf-stat-item">
          <p className="pdf-stat-label">Zhang-Shasha Distance</p>
          <p className="pdf-stat-value pdf-stat-primary">{data.analysis.editDistance}</p>
        </div>
      </div>

      {(hasParseFailure || hasFallbackFailure) && (
        <div className="pdf-diagnostic-note">
          <h3>Analysis Diagnostics</h3>
          {hasParseFailure && (
            <p>
              Parser degradation detected. The report may show zero or reduced structural evidence because one or more commits/files exceeded parser health limits.
              {parserDiagnostics ? ` Latest parser status: ${parserDiagnostics.status}; old error ratio ${parserDiagnostics.oldErrorRatio}; new error ratio ${parserDiagnostics.newErrorRatio}.` : ''}
            </p>
          )}
          {hasFallbackFailure && (
            <p>Deep fallback verification reported a parsing or fallback failure. Missing receipts should not be interpreted as confirmed originality.</p>
          )}
        </div>
      )}

      {data.intelligence && (
        <div className="pdf-section no-break">
          <div className="pdf-intel-row">
            <div className={`pdf-intel-origin ${data.intelligence.globalOriginality?.status === 'Original' ? 'authentic' : ''}`}>
              <p className="pdf-intel-origin-label">Origin Verification</p>
              <h3 className={`pdf-intel-origin-status ${data.intelligence.globalOriginality?.status === 'Original' ? 'authentic' : 'warning'}`}>
                {data.intelligence.globalOriginality?.status || 'Pending'}
              </h3>

              {data.intelligence.globalOriginality?.status === 'Original' && (
                <div style={{ marginBottom: '15px', padding: '8px', borderRadius: '6px', backgroundColor: (hasParseFailure || hasFallbackFailure) ? '#fffbeb' : '#f0fdf4', border: `1px solid ${(hasParseFailure || hasFallbackFailure) ? '#fde68a' : '#bbf7d0'}` }}>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Verification Confidence</p>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 'bold', color: (hasParseFailure || hasFallbackFailure) ? '#d97706' : '#166534' }}>
                    {(hasParseFailure || hasFallbackFailure) ? 'Parser-Degraded No-Match' : 'Clean No-Match'}
                  </p>
                </div>
              )}

              {data.intelligence.globalOriginality?.similarityScore && (
                <div className="pdf-intel-sim-box">
                  <p className="pdf-intel-sim-label">AST STRUCTURAL SIMILARITY:</p>
                  <p className="pdf-intel-sim-val">{data.intelligence.globalOriginality.similarityScore}</p>
                </div>
              )}

              {data.intelligence.globalOriginality?.matches?.length > 0 && (
                <div>
                  <p className="pdf-intel-match-label">Matched Sources:</p>
                  {data.intelligence.globalOriginality.matches.map((url, idx) => (
                    <p key={idx} className="pdf-intel-match-url">{url}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="pdf-intel-summary">
              <p className="pdf-intel-summary-label">Semantic Code Analysis</p>
              <div className="pdf-intel-summary-text">
                {typeof data.intelligence.llmSummary === 'string'
                  ? data.intelligence.llmSummary
                  : data.intelligence.llmSummary?.overall_logic_summary || "No semantic summary available."}
              </div>
            </div>
          </div>
        </div>
      )}

      {evidenceReport && (
        <div className="pdf-section no-break">
          <h3 className="pdf-section-title">Forensic Evidence Receipts</h3>
          <div className="pdf-evidence-summary">
            <div>
              <p className="pdf-stat-label">Classification</p>
              <p className="pdf-evidence-classification">{evidenceReport.plagiarismType === 'CLEAN_ORIGINAL_CODE' ? 'CLEAN_ORIGINAL_CODE' : evidenceReport.plagiarismType}</p>
            </div>
            <div>
              <p className="pdf-stat-label">Containment</p>
              <p className="pdf-evidence-metric">{evidenceReport.projectContainment}%</p>
            </div>
            <div>
              <p className="pdf-stat-label">Dominance</p>
              <p className="pdf-evidence-metric">{evidenceReport.dominanceScore}%</p>
            </div>
          </div>
          <div className="pdf-diagnostic-note">
            <h3>Evidence Gate</h3>
            <p>{buildEvidenceHeadline() || `Matched fingerprints that reached evidence gating: ${evidenceGateLabel}.`}</p>
            {parserDiagnostics && (
              <p>
                Parser status: <strong>{parserDiagnostics.status}</strong>
                {parserDiagnostics.usedFragmentRecovery ? ' with fragment recovery applied.' : ''}
              </p>
            )}
          </div>
          {buildClassificationExplanation() && (
            <p className="pdf-evidence-explanation">{buildClassificationExplanation()}</p>
          )}

          {evidenceReport.sources?.length > 0 ? (
            evidenceReport.sources.map((source, sourceIndex) => (
              <div key={source.docId || sourceIndex} className="pdf-receipt-box">
                <div className="pdf-receipt-header">
                  <div>
                    <p className="pdf-receipt-label">Source URL</p>
                    <p className="pdf-receipt-url">{source.sourceUrl}</p>
                  </div>
                  <div className="pdf-receipt-score">
                    <span>{source.containment}%</span>
                    <small>containment</small>
                  </div>
                </div>
                <div className="pdf-receipt-meta">
                  <span>Origin: {source.sourceOrigin}</span>
                  <span>Trust weight: {source.trustWeight}</span>
                  <span>File: {source.fileName}</span>
                </div>
                {source.sourceOrigin === 'boilerplate' && (
                  <p className="pdf-boilerplate-note">Low-trust boilerplate match suppressed from primary classification.</p>
                )}
                <table className="pdf-receipt-table">
                  <thead>
                    <tr>
                      <th>Student Lines</th>
                      <th>Source Lines</th>
                      <th>Fingerprints</th>
                      <th>Confidence</th>
                      <th>Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(source.topSegments || []).map((segment, index) => (
                      <tr key={index}>
                        <td>{segment.student?.startLine}-{segment.student?.endLine}</td>
                        <td>{segment.source?.startLine}-{segment.source?.endLine}</td>
                        <td>{segment.fingerprintCount || segment.hashIds?.length || 'n/a'}</td>
                        <td>{Math.round((segment.confidence?.score || 0) * 100)}% {segment.confidence?.label}</td>
                        <td>
                          D {segment.confidence?.breakdown?.density ?? 0},
                          L {segment.confidence?.breakdown?.length ?? 0},
                          U {segment.confidence?.breakdown?.uniqueness ?? 0},
                          C {segment.confidence?.breakdown?.coherence ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <div className="pdf-evidence-empty-box">
              <p className="pdf-evidence-empty">
                {!zeroMatchState && evidenceReport.rejectionReason ? (
                  <strong>{evidenceReport.rejectionReason}</strong>
                ) : (
                  zeroMatchState
                    ? 'No evidence receipts were generated for this submission.'
                    : "No qualifying evidence receipts passed the confidence threshold."
                )}
                {(hasParseFailure || hasFallbackFailure) ? ' Analysis diagnostics above indicate this may be due to parser or fallback degradation.' : ''}
              </p>
            </div>
          )}

          {evidenceReport.suppressedSources && evidenceReport.suppressedSources.length > 0 && (
            <div className="pdf-suppressed-section" style={{ marginTop: '30px', borderTop: '2px dashed #cbd5e1', paddingTop: '20px' }}>
              <h4 className="pdf-section-title" style={{ color: '#64748b', borderBottom: 'none', marginBottom: '5px' }}>
                <span style={{ fontSize: '18px', marginRight: '8px' }}>🛡️</span>
                Suppressed Evidence Receipts
              </h4>
              <p className="pdf-evidence-explanation" style={{ marginBottom: '15px' }}>
                The following raw receipts were detected by the system but suppressed from the final classification because they were rejected by the integrity gates.
              </p>
              {evidenceReport.suppressedSources.map((source, sourceIndex) => (
                <div key={source.docId || sourceIndex} className="pdf-receipt-box suppressed" style={{ opacity: 0.8, background: '#f8fafc' }}>
                  <div className="pdf-receipt-header">
                    <div>
                      <p className="pdf-receipt-label">Source URL</p>
                      <p className="pdf-receipt-url">{source.sourceUrl}</p>
                    </div>
                    <div className="pdf-receipt-score">
                      <span>{source.containment}%</span>
                      <small>containment</small>
                    </div>
                  </div>
                  <div className="pdf-receipt-meta">
                    <span>Origin: {source.sourceOrigin}</span>
                    <span>Trust weight: {source.trustWeight}</span>
                    <span>File: {source.fileName}</span>
                  </div>
                  {source.sourceOrigin === 'boilerplate' && (
                    <p className="pdf-boilerplate-note">Low-trust boilerplate match suppressed from primary classification.</p>
                  )}
                  <table className="pdf-receipt-table">
                    <thead>
                      <tr>
                        <th>Student Lines</th>
                        <th>Source Lines</th>
                        <th>Fingerprints</th>
                        <th>Confidence</th>
                        <th>Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(source.topSegments || []).map((segment, index) => (
                        <tr key={index}>
                          <td>{segment.student?.startLine}-{segment.student?.endLine}</td>
                          <td>{segment.source?.startLine}-{segment.source?.endLine}</td>
                          <td>{segment.fingerprintCount || segment.hashIds?.length || 'n/a'}</td>
                          <td>{Math.round((segment.confidence?.score || 0) * 100)}% {segment.confidence?.label}</td>
                          <td>
                            D {segment.confidence?.breakdown?.density ?? 0},
                            L {segment.confidence?.breakdown?.length ?? 0},
                            U {segment.confidence?.breakdown?.uniqueness ?? 0},
                            C {segment.confidence?.breakdown?.coherence ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {humanOverrides.length > 0 && (
        <div className="pdf-section no-break">
          <h3 className="pdf-section-title">Reviewer Audit Trail</h3>
          <table className="pdf-receipt-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Reviewed By</th>
                <th>Decision</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {humanOverrides.map((override) => (
                <tr key={override.overrideId}>
                  <td>{new Date(override.createdAt).toLocaleString()}</td>
                  <td>{override.reviewerId || 'Unspecified reviewer'}</td>
                  <td>{override.action}</td>
                  <td>{override.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pdf-section">
        <h3 className="pdf-section-title">Evolution Pulse</h3>
        <div className="pdf-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.pulseData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Area isAnimationActive={false} type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fillOpacity={0.1} fill="#4f46e5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.clusters.suspect.commits.length > 0 && (
        <div className="pdf-suspect-box">
          <h3 className="pdf-suspect-title">⚠️ High-Velocity Dumps Detected ({data.clusters.suspect.commits.length})</h3>
          <div className="pdf-suspect-grid">
            {data.clusters.suspect.commits.map(c => (
              <div key={c.sha} className="pdf-suspect-item">
                <div className="pdf-suspect-item-header">
                  <span className="pdf-suspect-item-msg">
                    {c.message ? c.message.split('\n')[0].substring(0, 45) + (c.message.length > 45 ? '…' : '') : c.sha}
                  </span>
                  <span className="pdf-suspect-item-score">r: {c.score}</span>
                </div>
                <span className="pdf-suspect-item-sha">{c.sha}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pdf-section">
        <h3 className="pdf-section-title">Semantic Commit Clusters</h3>
        <div className="pdf-clusters">
          {Object.entries(data.clusters).map(([key, group]) => {
            const clusterClass = key === 'authentic' ? 'authentic' : key === 'standard' ? 'standard' : 'suspect';
            return (
              <div key={key} className={`pdf-cluster-box ${clusterClass}`}>
                <div className="pdf-cluster-header">
                  <h4 className="pdf-cluster-title">{group.label}</h4>
                  <span className="pdf-cluster-count">{group.commits.length} Commits</span>
                </div>
                <div className="pdf-cluster-grid">
                  {group.commits.length > 0 ? group.commits.map((c, i) => (
                    <div key={i} className="pdf-cluster-item">
                      <div className="pdf-cluster-item-left">
                        <p className="pdf-cluster-item-msg">
                          {c.message ? c.message.split('\n')[0].substring(0, 40) + (c.message.length > 40 ? '…' : '') : c.sha}
                        </p>
                        <p className="pdf-cluster-item-sha">{c.sha}</p>
                      </div>
                      <span className="pdf-cluster-item-score">r: {c.score}</span>
                    </div>
                  )) : (
                    <p className="pdf-cluster-empty">No commits in cluster</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.authorStats && data.authorStats.length > 0 && (
        <div className="pdf-section no-break">
          <h3 className="pdf-section-title">
            Contributor Authentication ({data.authorStats.length} Detected)
          </h3>
          <div className="pdf-authors-grid">
            {data.authorStats.map((author, i) => {
              const scoreClass = author.averageScore >= 0.85 ? 'high' : author.averageScore >= 0.45 ? 'mid' : 'low';
              return (
                <div key={i} className="pdf-author-card">
                  <div>
                    <p className="pdf-author-name">{author.name}</p>
                    <p className="pdf-author-count">{author.commitCount} Total Commits</p>
                  </div>
                  <div className="pdf-author-score-wrapper">
                    <p className="pdf-author-score-label">Avg Integrity</p>
                    <p className={`pdf-author-score-value ${scoreClass}`}>
                      {author.averageScore.toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pdf-section">
        <h3 className="pdf-section-title">Complete Audit Log</h3>
        <table className="pdf-log-table">
          <thead>
            <tr>
              <th>Commit SHA</th>
              <th>Date</th>
              <th>Message</th>
              <th style={{ textAlign: 'right' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.commits.map(c => (
              <tr key={c.sha}>
                <td className="pdf-log-cell-sha">{c.sha}</td>
                <td className="pdf-log-cell-date">{new Date(c.date).toLocaleDateString()}</td>
                <td>{c.message.substring(0, 60)}{c.message.length > 60 ? '...' : ''}</td>
                <td className={`pdf-log-cell-score ${c.score < 0.45 ? 'warning' : ''}`}>{c.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pdf-section no-break">
        <h3 className="pdf-section-title">Raw CST Fragment</h3>
        <div className="pdf-cst-box">
          {data.analysis.cst}
        </div>
      </div>

      <div className="pdf-section no-break">
        <h3 className="pdf-section-title">AI Semantic Analysis Summary</h3>
        <div className="pdf-intel-semantic-box">
          {typeof data.intelligence?.llmSummary === 'string' ? data.intelligence.llmSummary : data.intelligence?.llmSummary?.overall_logic_summary || "No semantic summary generated for this repository."}
        </div>
      </div>

      {data.matrix && data.matrix.length > 0 && (
        <div className="pdf-section no-break">
          <h3 className="pdf-section-title">Document Alignment Matrix</h3>

          {data.semanticSubstitutionViolation && (
            <div className="pdf-align-warning-banner">
              <strong>⚠ Semantic Substitution Violation:</strong> {data.violationReason}
            </div>
          )}

          {data.semanticSubstitutionViolation && data.semanticSubstitutionProofs?.length > 0 && (
            <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
              {data.semanticSubstitutionProofs.map((proof, index) => (
                <div
                  key={`${proof.fileName}-${proof.lineNumber}-${index}`}
                  style={{
                    border: '1px solid #fdba74',
                    background: '#fff7ed',
                    borderRadius: '10px',
                    padding: '10px 12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9a3412' }}>
                      Shortcut Proof
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#9a3412' }}>
                      {proof.provider} via {proof.evidenceType === 'dependency' ? 'dependency' : 'logic call'}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#9a3412', marginBottom: '4px' }}>
                    {proof.fileName}:{proof.lineNumber}
                  </div>
                  <pre style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '10px',
                    lineHeight: 1.45,
                    color: '#431407',
                    fontFamily: 'Courier New, monospace'
                  }}>
                    {proof.excerpt}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Score banner */}
          <div className="pdf-align-banner">
            <div className="pdf-align-score-block">
              <p className="pdf-align-score-label">Alignment Score</p>
              <p className={`pdf-align-score-value ${data.alignmentScore >= 70 ? 'high' : data.alignmentScore >= 40 ? 'mid' : 'low'}`}>
                {data.alignmentScore}%
              </p>
            </div>
            <div className="pdf-align-claims-block">
              <p className="pdf-align-claims-label">Technology Claims Detected</p>
              <p className="pdf-align-claims-value">{data.matrix.length}</p>
            </div>
            <div className="pdf-align-verified-block">
              <p className="pdf-align-verified-label">Verified in Codebase</p>
              <p className="pdf-align-verified-value">
                {data.matrix.filter(c => c.status.startsWith('Verified')).length} / {data.matrix.length}
              </p>
            </div>
          </div>

          {/* Matrix table */}
          <table className="pdf-align-table">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>#</th>
                <th style={{ width: '40%' }}>Technology Claimed</th>
                <th style={{ width: '50%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row, idx) => {
                const isVerified = row.status.startsWith('Verified');
                const isFailure = row.status.includes('Parsing Failure') || row.status.includes('Fallback Failure');
                
                return (
                  <tr key={idx} className={isVerified ? 'pdf-align-row-verified' : (isFailure ? 'pdf-align-row-warning' : 'pdf-align-row-unverified')}>
                    <td className="pdf-align-cell-num">{idx + 1}</td>
                    <td className="pdf-align-cell-tech">
                      <span className="pdf-align-tech-badge">{row.name}</span>
                    </td>
                    <td>
                      <span className={`pdf-align-status ${isVerified ? 'verified' : (isFailure ? 'warning' : 'unverified')}`}>
                        {isVerified ? `✓ ${row.status}` : (isFailure ? '⚠ Parsing Failure' : '✗ Not Found')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="pdf-appendix">
        <h2 className="pdf-appendix-title">Appendix: Understanding the Metrics</h2>
        <div className="pdf-appendix-body">
          <div className="pdf-appendix-box primary">
            <h4 className="pdf-appendix-subtitle">1. What are AST Nodes? (Old vs. New)</h4>
            <p className="pdf-appendix-text">An Abstract Syntax Tree (AST) is a mathematical representation of the code's structure. <strong> Old AST Nodes</strong> represent the complexity of the codebase <em>before</em> the commit. <strong> New AST Nodes</strong> represent the complexity <em>after</em> the commit. Comparing them allows us to measure exact structural growth.</p>
          </div>
          <div className="pdf-appendix-box primary">
            <h4 className="pdf-appendix-subtitle">2. How is the Integrity Score Calculated?</h4>
            <p className="pdf-appendix-text">The engine uses the Zhang-Shasha algorithm to calculate the <strong>Tree Edit Distance</strong> (the minimum number of semantic operations needed to transform the Old AST into the New AST). The Integrity Score ($r$) is calculated as: <code>1 - (Edit Distance / Max Nodes)</code>. A massive injection of code without gradual human edits results in a low score.</p>
          </div>
          <div className="pdf-appendix-box success">
            <h4 className="pdf-appendix-subtitle">3. What is considered a Good Score?</h4>
            <ul className="pdf-appendix-list">
              <li><strong>0.85 - 1.00 (Authentic):</strong> Indicates steady, human-paced development and careful refactoring.</li>
              <li><strong>0.45 - 0.84 (Standard):</strong> Normal feature additions and expected structural modifications.</li>
              <li><strong>0.00 - 0.44 (Suspect):</strong> Anomalous "High-Velocity Dumps." Often indicates pasting large AI-generated blocks or uncredited boilerplate.</li>
            </ul>
          </div>
          <div className="pdf-appendix-box dark">
            <h4 className="pdf-appendix-subtitle">4. How to read the Raw CST Fragment?</h4>
            <p className="pdf-appendix-text">The Concrete Syntax Tree (CST) fragment is the raw grammar output generated by our parsers. It strips away formatting and exposes how the machine interprets the logic. It acts as the immutable forensic proof used to calculate the edit distance.</p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default GitPulsePdfReport;
