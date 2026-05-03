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
 * Merges individual fingerprint matches into continuous code segments.
 * Uses adaptive gaps and normalized continuity.
 */
function mergeSegments(matches) {
    if (!matches || matches.length === 0) return [];

    // Sort matches by student position to ensure we process them linearly
    const sortedMatches = [...matches].sort((a, b) => a.studentStart - b.studentStart);

    // Calculate adaptive max gap based on median distance between adjacent student matches
    const distances = [];
    for (let i = 1; i < sortedMatches.length; i++) {
        distances.push(sortedMatches[i].studentStart - sortedMatches[i - 1].studentEnd);
    }
    const medianGap = calculateMedian(distances);
    const maxGap = Math.max(medianGap * 2, 50); // Ensure a reasonable minimum floor of 50 bytes

    const segments = [];
    let current = null;

    for (const m of sortedMatches) {
        if (!current) {
            current = {
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
                matches: [m] // Store matches to compute coherence later
            };
            continue;
        }

        const studentGap = m.studentStart - current.studentEnd;
        const sourceGap = m.sourceStart - current.sourceEnd;

        // Normalized continuity constraint
        // ratio = studentGap / (sourceGap + 1)
        const ratio = studentGap / (Math.abs(sourceGap) + 1);
        
        // Valid continuity: ratio between 0.7 and 1.3. Also prevent large backwards jumps.
        const isContinuous = sourceGap >= -50 && ratio >= 0.7 && ratio <= 1.3;

        // Allow merging if it's perfectly continuous or just very close (e.g., adjacent tokens/statements)
        const isVeryClose = studentGap <= maxGap && Math.abs(sourceGap) <= maxGap;

        if (isVeryClose || (isContinuous && studentGap <= maxGap * 3)) {
            // Merge
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

    return segments;
}

/**
 * Computes a multi-factor confidence score for a segment.
 */
function computeConfidence(segment, studentFingerprints) {
    const length = segment.studentEnd - segment.studentStart;
    if (length <= 0) return 0;
    
    // 1. Density
    // Expected fingerprints: roughly 1 per 50 bytes (heuristic based on winnowing)
    const expectedFps = Math.max(1, length / 50);
    const density = Math.min(1, segment.fingerprintCount / expectedFps);

    // 2. Length Score
    // Max expected block length around 5000 bytes (for scoring purposes)
    const lengthScore = Math.min(length / 5000, 1);

    // 3. Uniqueness Score (IDF)
    const avgIDF = segment.fingerprintCount > 0 ? (segment.totalUniqueness / segment.fingerprintCount) : 0;
    // Assuming max IDF is around 10 (e.g., ln(22000/1))
    const uniquenessScore = Math.min(avgIDF / 10, 1);

    const baseConfidence = (0.25 * density) + (0.25 * lengthScore) + (0.50 * uniquenessScore);

    // 4. Segment Coherence
    // Find how many student fingerprints actually exist within this byte range
    let possibleFpsInRange = 0;
    for (const fp of studentFingerprints) {
        if (fp.startPos >= segment.studentStart && fp.endPos <= segment.studentEnd) {
            possibleFpsInRange++;
        }
    }
    const coherence = possibleFpsInRange > 0 ? segment.fingerprintCount / possibleFpsInRange : 1;

    // Final confidence is penalized by low coherence
    return Math.min(1, baseConfidence * coherence);
}

/**
 * Filters out noise and random collisions.
 */
function filterNoise(segments) {
    return segments.filter(seg => 
        seg.fingerprintCount >= 3 && // At least 3 matching fingerprints
        (seg.studentEnd - seg.studentStart) > 30 // Block must be at least 30 bytes
    );
}

/**
 * Classifies the type of plagiarism based on overall containment and segment properties.
 */
function classifyPlagiarism(containment, segments) {
    if (containment >= 0.8) return 'FULL_CLONE';
    
    // Check for mosaic: many small segments
    if (segments.length >= 10) {
        const avgLength = segments.reduce((acc, seg) => acc + (seg._studentEnd - seg._studentStart), 0) / segments.length;
        if (avgLength < 500) return 'MOSAIC';
    }

    if (containment >= 0.3) return 'PARTIAL_CLONE';
    
    return 'BOILERPLATE_HEAVY';
}

/**
 * Ranks candidate sources by their containment score.
 */
function rankSources(studentFingerprints, matchesByDoc) {
    const totalStudentFingerprints = studentFingerprints.length;
    if (totalStudentFingerprints === 0) return [];

    const sources = [];

    for (const [docId, matches] of Object.entries(matchesByDoc)) {
        let segments = mergeSegments(matches);
        segments = filterNoise(segments);

        if (segments.length === 0) continue;

        // Calculate confidence for each segment
        const scoredSegments = segments.map(seg => ({
            student: { startLine: seg.studentStartLine || 1, endLine: seg.studentEndLine || 1 },
            source: { startLine: seg.sourceStartLine || 1, endLine: seg.sourceEndLine || 1 },
            confidence: parseFloat(computeConfidence(seg, studentFingerprints).toFixed(2)),
            // keeping internal metrics for classification but they won't be returned to UI
            _studentStart: seg.studentStart,
            _studentEnd: seg.studentEnd
        }));

        // Sort segments by confidence descending
        scoredSegments.sort((a, b) => b.confidence - a.confidence);

        const matchedFingerprintCount = matches.length; 
        const containmentScore = parseFloat((matchedFingerprintCount / totalStudentFingerprints).toFixed(4));

        sources.push({
            docId,
            containment: containmentScore,
            segments: scoredSegments
        });
    }

    // Sort sources by containment descending
    sources.sort((a, b) => b.containment - a.containment);
    return sources;
}

/**
 * The main Evidence Mapping algorithm.
 * Turns random fingerprint matches into clear, continuous copied code blocks with source attribution.
 * 
 * @param {Array} studentFingerprints - Fingerprints from the student's code
 * @param {Object} matchesByDoc - Database lookup results grouped by docId
 */
export function buildEvidenceMap(studentFingerprints, matchesByDoc) {
    const result = {
        plagiarismType: 'NONE',
        sources: []
    };

    if (studentFingerprints.length === 0) return result;

    const rankedSources = rankSources(studentFingerprints, matchesByDoc);

    // Limit to Top 3 Sources
    const topSources = rankedSources.slice(0, 3);

    // Overall classification is based on the top source
    if (topSources.length > 0) {
        result.plagiarismType = classifyPlagiarism(topSources[0].containment, topSources[0].segments);
    }

    for (const source of topSources) {
        // Safe Evidence Compression
        const topSegments = source.segments.slice(0, 5).map(seg => ({
            student: seg.student,
            source: seg.source,
            confidence: seg.confidence
        }));

        const restSegments = source.segments.slice(5);
        let avgConfidence = 0;
        if (restSegments.length > 0) {
            const sum = restSegments.reduce((acc, seg) => acc + seg.confidence, 0);
            avgConfidence = parseFloat((sum / restSegments.length).toFixed(2));
        }

        result.sources.push({
            docId: source.docId,
            containment: Math.round(source.containment * 100), // Return as percentage for UI
            topSegments: topSegments,
            otherMatches: {
                count: restSegments.length,
                avgConfidence: avgConfidence
            }
        });
    }

    return result;
}
