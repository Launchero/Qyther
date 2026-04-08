/**
 * Query Complexity Analyzer
 * Analyzes query complexity for AI processing
 */

export interface QueryAnalysis {
  isComplex: boolean;
  confidence: number;
  reasoning: string[];
}

/**
 * Keywords that suggest complex queries
 */
const COMPLEX_KEYWORDS = [
  'find all', 'search for', 'analyze', 'compare',
  'create', 'write code', 'generate', 'build',
  'multiple', 'list all', 'extract', 'transform',
  'step by step', 'workflow', 'process',
  'file', 'directory', 'folder', 'project',
  'code', 'function', 'class', 'module',
  'debug', 'fix', 'refactor', 'optimize',
];

/**
 * Analyze query complexity to determine routing
 */
export function analyzeQueryComplexity(query: string): QueryAnalysis {
  const reasoning: string[] = [];
  let complexityScore = 0;
  const lowerQuery = query.toLowerCase();

  // Factor 1: Check for complex keywords
  const foundKeywords = COMPLEX_KEYWORDS.filter(keyword => 
    lowerQuery.includes(keyword)
  );
  
  if (foundKeywords.length > 0) {
    complexityScore += foundKeywords.length * 0.15;
    reasoning.push(`Found complex keywords: ${foundKeywords.join(', ')}`);
  }

  // Factor 2: Query length
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 15) {
    complexityScore += 0.3;
    reasoning.push(`Long query (${wordCount} words)`);
  } else if (wordCount > 8) {
    complexityScore += 0.15;
    reasoning.push(`Medium-length query (${wordCount} words)`);
  }

  // Factor 3: Multiple questions (check for multiple question marks or conjunctions)
  const questionMarks = (query.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    complexityScore += 0.2;
    reasoning.push(`Multiple questions (${questionMarks})`);
  }

  const hasConjunctions = /\b(and|or|then|also|plus)\b/.test(lowerQuery);
  if (hasConjunctions && wordCount > 10) {
    complexityScore += 0.15;
    reasoning.push('Contains conjunctions suggesting multiple tasks');
  }

  // Factor 4: Action verbs suggesting tool use
  const actionVerbs = /\b(find|search|create|make|build|write|generate|analyze|compare)\b/.test(lowerQuery);
  if (actionVerbs) {
    complexityScore += 0.2;
    reasoning.push('Contains action verbs suggesting tool use');
  }

  // Determine if complex (threshold: 0.4)
  const isComplex = complexityScore >= 0.4;
  
  return {
    isComplex,
    confidence: Math.min(complexityScore, 1.0),
    reasoning,
  };
}

/**
 * Simple heuristic to check if query needs complex processing
 */
export function needsComplexProcessing(query: string): boolean {
  const analysis = analyzeQueryComplexity(query);
  return analysis.isComplex;
}
