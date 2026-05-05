// server/utils/evidenceMapper.js

/**
 * Calculates the median of an array of numbers.
 */
function calculateMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

/**
 * Merges individual fingerprint matches into continuous code segments, strictly within file boundaries.
 */
function mergeSegments(matches) {
    if (!matches || matches.length === 0) return [];

    // Group matches by student file name to prevent cross-file merging
    const matchesByFile = {};
    for (const m of matches) {
        const file = m.studentFileName || "unknown";
        if (!matchesByFile[file]) matchesByFile[file] = [];
        matchesByFile[file].push(m);
    }
    
    const allSegments = [];
    
    for (const [file, fileMatches] of Object.entries(matchesByFile)) {
        const sortedMatches = [...fileMatches].sort((a, b) => a.studentStart - b.studentStart);

        const distances = [];
        for (let i = 1; i < sortedMatches.length; i++) {
            distances.push(sortedMatches[i].studentStart - sortedMatches[i - 1].studentEnd);
        }
        const medianGap = calculateMedian(distances);
        const maxGap = Math.max(medianGap * 2, 50);

        const segments = [];
        let current = null;

        for (const m of sortedMatches) {
            if (!current) {
                current = {
                    studentFileName: file,
                    studentStart: m.studentStart,
                    studentEnd: m.studentEnd,
                    studentStartLine: m.studentStartLine,
                    studentEndLine: m.studentEndLine,
                    sourceStart: m.sourceStart,
                    sourceEnd: m.sourceEnd,
                    sourceStartLine: m.sourceStartLine,
                    sourceEndLine: m.sourceEndLine,
                    fingerprintCount: 1,
                    totalUniqueness: m.uniqueness || 0,
                    matches: [m]
                };
                continue;
            }

            const studentGap = m.studentStart - current.studentEnd;
            const sourceGap = m.sourceStart - current.sourceEnd;

            const ratio = studentGap / (Math.abs(sourceGap) + 1);
            const isContinuous = sourceGap >= -50 && ratio >= 0.7 && ratio <= 1.3;
            const isVeryClose = studentGap <= maxGap && Math.abs(sourceGap) <= maxGap;

            if (isVeryClose || (isContinuous && studentGap <= maxGap * 3)) {
                current.studentEnd = Math.max(current.studentEnd, m.studentEnd);
                current.studentEndLine = Math.max(current.studentEndLine, m.studentEndLine);
                current.sourceEnd = Math.max(current.sourceEnd, m.sourceEnd);
                current.sourceEndLine = Math.max(current.sourceEndLine, m.sourceEndLine);
                current.fingerprintCount++;
                current.totalUniqueness += (m.uniqueness || 0);
                current.matches.push(m);
            } else {
                segments.push(current);
                current = {
                    studentFileName: file,
                    studentStart: m.studentStart,
                    studentEnd: m.studentEnd,
                    studentStartLine: m.studentStartLine,
                    studentEndLine: m.studentEndLine,
                    sourceStart: m.sourceStart,
                    sourceEnd: m.sourceEnd,
                    sourceStartLine: m.sourceStartLine,
                    sourceEndLine: m.sourceEndLine,
                    fingerprintCount: 1,
                    totalUniqueness: m.uniqueness || 0,
                    matches: [m]
                };
            }
        }

        if (current) segments.push(current);
        allSegments.push(...segments);
    }

    return allSegments;
}

/**
 * Computes multi-factor confidence and an explainability breakdown.
 */
function computeConfidence(segment, studentFingerprints) {
    const length = segment.studentEnd - segment.studentStart;
    if (length <= 0) return { score: 0, breakdown: { density: 0, length: 0, uniqueness: 0, coherence: 0 } };
    
    const expectedFps = Math.max(1, length / 50);
    const density = Math.min(1, segment.fingerprintCount / expectedFps);

    const lengthScore = Math.min(length / 5000, 1);

    const avgIDF = segment.fingerprintCount > 0 ? (segment.totalUniqueness / segment.fingerprintCount) : 0;
    const uniquenessScore = Math.min(avgIDF / 10, 1);

    const baseConfidence = (0.25 * density) + (0.25 * lengthScore) + (0.50 * uniquenessScore);

    let possibleFpsInRange = 0;
    for (const fp of studentFingerprints) {
        if (fp.fileName === segment.studentFileName && 
            fp.startPos >= segment.studentStart && 
            fp.endPos <= segment.studentEnd) {
            possibleFpsInRange++;
        }
    }
    const coherence = possibleFpsInRange > 0 ? segment.fingerprintCount / possibleFpsInRange : 1;

    const finalScore = Math.min(1, baseConfidence * coherence);

    return {
        score: finalScore,
        uniquenessScore: uniquenessScore,
        breakdown: {
            density: parseFloat(density.toFixed(2)),
            length: parseFloat(lengthScore.toFixed(2)),
            uniqueness: parseFloat(uniquenessScore.toFixed(2)),
            coherence: parseFloat(coherence.toFixed(2))
        }
    };
}

/**
 * Dynamically calibrates the raw score into a UI-ready label.
 */
function calibrateConfidence(score, uniqueness) {
    if (score > 0.85 && uniqueness > 0.7) return "Highly likely copied";
    if (score > 0.65) return "Strong similarity";
    if (score > 0.4) return "Suspicious";
    return "Weak signal";
}

/**
 * Filters out noise and random collisions.
 */
function filterNoise(segments) {
    return segments.filter(seg => 
        seg.fingerprintCount >= 3 && 
        (seg.studentEnd - seg.studentStart) > 30
    );
}

function validateSegmentMapping(segment) {
    const warnings = [];
    if (segment.studentStart > segment.studentEnd) warnings.push('student_range_inverted');
    if (segment.sourceStart > segment.sourceEnd) warnings.push('source_range_inverted');
    if ((segment.studentStartLine || 0) > (segment.studentEndLine || 0)) warnings.push('student_lines_inverted');
    if ((segment.sourceStartLine || 0) > (segment.sourceEndLine || 0)) warnings.push('source_lines_inverted');

    for (const match of segment.matches || []) {
        const insideStudentRange = match.studentStart >= segment.studentStart && match.studentEnd <= segment.studentEnd;
        const insideSourceRange = match.sourceStart >= segment.sourceStart && match.sourceEnd <= segment.sourceEnd;
        if (!insideStudentRange || !insideSourceRange) {
            warnings.push('match_outside_merged_range');
            break;
        }
    }

    return {
        passed: warnings.length === 0,
        warnings
    };
}

const MIN_MATCHED_FINGERPRINTS_FOR_CONFIDENT_CLASSIFICATION = 25;
const env = globalThis.process?.env || {};
const CALIBRATION = {
    fullCloneContainment: Number(env.GP_FULL_CLONE_CONTAINMENT || 0.8),
    fullCloneDominance: Number(env.GP_FULL_CLONE_DOMINANCE || 0.7),
    mosaicMinSources: Number(env.GP_MOSAIC_MIN_SOURCES || 3),
    mosaicMinSegments: Number(env.GP_MOSAIC_MIN_SEGMENTS || 8),
    mosaicSegmentRatio: Number(env.GP_MOSAIC_SEGMENT_RATIO || 0.2),
    partialCloneContainment: Number(env.GP_PARTIAL_CLONE_CONTAINMENT || 0.4)
};

/**
 * Multi-dimensional Plagiarism Classification with strict priority ordering.
 */
function classifyPlagiarism(projectContainment, dominance, uniqueSources, totalSegments, totalFingerprints, totalMatchedFingerprints) {
    if (totalMatchedFingerprints < MIN_MATCHED_FINGERPRINTS_FOR_CONFIDENT_CLASSIFICATION) {
        return 'LOW_CONFIDENCE';
    }

    // 1. Full Clone Priority
    if (projectContainment > CALIBRATION.fullCloneContainment && dominance > CALIBRATION.fullCloneDominance) return 'FULL_CLONE';
    
    // 2. Mosaic Check
    const segmentRatio = totalFingerprints > 0 ? (totalSegments / totalFingerprints) : 0;
    if (
        uniqueSources >= CALIBRATION.mosaicMinSources &&
        totalSegments >= CALIBRATION.mosaicMinSegments &&
        segmentRatio > CALIBRATION.mosaicSegmentRatio
    ) {
        return 'MOSAIC';
    }

    // 3. Partial Clone Check
    if (projectContainment > CALIBRATION.partialCloneContainment) return 'PARTIAL_CLONE';
    
    return 'LOW_CONFIDENCE';
}

/**
 * The main Evidence Mapping algorithm with Project-Level Aggregation.
 */
export function buildProjectReport(studentFingerprints, matchesByDoc, documentsMetadata = {}) {
    const result = {
        projectContainment: 0,
        dominanceScore: 0,
        plagiarismType: 'NONE',
        totalMatchedFingerprints: 0,
        minimumEvidenceThreshold: MIN_MATCHED_FINGERPRINTS_FOR_CONFIDENT_CLASSIFICATION,
        calibration: CALIBRATION,
        sources: []
    };

    if (!studentFingerprints || studentFingerprints.length === 0) return result;
    const totalStudentFingerprints = studentFingerprints.length;

    let candidateSources = [];
    let totalRankedContainment = 0;

    for (const [docId, matches] of Object.entries(matchesByDoc)) {
        let segments = mergeSegments(matches);
        segments = filterNoise(segments);

        if (segments.length === 0) continue;

        // Explainability and Calibration
        const scoredSegments = segments.map(seg => {
            const confidenceCalc = computeConfidence(seg, studentFingerprints);
            return {
                studentFileName: seg.studentFileName,
                student: { startLine: seg.studentStartLine || 1, endLine: seg.studentEndLine || 1 },
                source: { startLine: seg.sourceStartLine || 1, endLine: seg.sourceEndLine || 1 },
                mappingValidation: validateSegmentMapping(seg),
                confidence: {
                    score: parseFloat(confidenceCalc.score.toFixed(2)),
                    label: calibrateConfidence(confidenceCalc.score, confidenceCalc.uniquenessScore),
                    breakdown: confidenceCalc.breakdown
                }
            };
        });

        // Sort segments by score
        scoredSegments.sort((a, b) => b.confidence.score - a.confidence.score);

        // Calculate Project-Level Containment contribution for this source
        const matchedFingerprintCount = matches.length; 
        const containmentScore = matchedFingerprintCount / totalStudentFingerprints;

        // Apply False Positive Guardrail (Boilerplate)
        let sourceOrigin = "unknown";
        if (documentsMetadata[docId]) {
            sourceOrigin = documentsMetadata[docId].sourceOrigin;
        }
        
        let effectiveContainment = containmentScore;
        if (sourceOrigin === 'boilerplate') {
            // Heavily penalize boilerplate sources so they don't dominate
            effectiveContainment *= 0.1;
        }

        candidateSources.push({
            docId,
            sourceOrigin,
            containment: effectiveContainment,
            rawContainment: containmentScore, // for true containment metrics
            segments: scoredSegments
        });
        
        totalRankedContainment += effectiveContainment;
    }

    // Sort sources by effective containment
    candidateSources.sort((a, b) => b.containment - a.containment);
    const topSources = candidateSources.slice(0, 3);
    
    // Project Aggregation
    if (topSources.length > 0) {
        // Dominance
        const dominantSource = topSources[0];
        result.dominanceScore = totalRankedContainment > 0 ? parseFloat((dominantSource.containment / totalRankedContainment).toFixed(2)) : 0;
        
        // Project Containment (union of top sources, simplified as sum of their containments due to disjoint matching usually, but capped at 1.0)
        let uniqueMatchedFingerprints = new Set();
        for (const source of topSources) {
            const matches = matchesByDoc[source.docId] || [];
            for (const m of matches) uniqueMatchedFingerprints.add(m.hash);
        }
        result.projectContainment = parseFloat((uniqueMatchedFingerprints.size / totalStudentFingerprints).toFixed(2));
        result.totalMatchedFingerprints = uniqueMatchedFingerprints.size;

        // Plagiarism Classification
        const uniqueSourcesCount = topSources.length;
        let totalSegmentsCount = 0;
        for (const s of topSources) totalSegmentsCount += s.segments.length;

        // Exclude boilerplate from FULL_CLONE trigger by checking dominant source origin
        if (dominantSource.sourceOrigin === 'boilerplate') {
            result.plagiarismType = 'BOILERPLATE_HEAVY';
        } else {
            result.plagiarismType = classifyPlagiarism(
                result.projectContainment, 
                result.dominanceScore, 
                uniqueSourcesCount, 
                totalSegmentsCount, 
                totalStudentFingerprints,
                result.totalMatchedFingerprints
            );
        }
    }

    // Compress Evidence Payload for UI
    for (const source of topSources) {
        const topSegments = source.segments.slice(0, 5);
        const restSegments = source.segments.slice(5);
        
        let avgConfidence = 0;
        if (restSegments.length > 0) {
            const sum = restSegments.reduce((acc, seg) => acc + seg.confidence.score, 0);
            avgConfidence = parseFloat((sum / restSegments.length).toFixed(2));
        }

        result.sources.push({
            docId: source.docId,
            sourceUrl: documentsMetadata[source.docId]?.sourceUrl || "unknown",
            fileName: documentsMetadata[source.docId]?.fileName || "unknown",
            containment: Math.round(source.rawContainment * 100),
            topSegments: topSegments,
            otherMatches: {
                count: restSegments.length,
                avgConfidence: avgConfidence
            }
        });
    }

    // Scale final containments
    result.projectContainment = Math.round(result.projectContainment * 100);
    result.dominanceScore = Math.round(result.dominanceScore * 100);

    return result;
}
