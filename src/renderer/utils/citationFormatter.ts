export interface CitationSource {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  confidence?: number;
  accessedAt?: Date;
}

export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Block dangerous protocols
    if (['javascript:', 'data:', 'file:', 'about:'].includes(parsed.protocol.toLowerCase())) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function formatCitation(index: number, source: CitationSource): string {
  const url = validateUrl(source.url) ? source.url : '#';
  const title = source.title || 'Untitled Source';
  return `[${index}] ${title} (${url})`;
}

export function formatConfidenceScore(confidence?: number): string {
  if (confidence === undefined) return '';
  
  if (confidence >= 90) return 'Very High';
  if (confidence >= 75) return 'High';
  if (confidence >= 60) return 'Medium';
  if (confidence >= 40) return 'Low';
  return 'Very Low';
}

export function formatAccessedDate(accessedAt?: Date): string {
  if (!accessedAt) return '';
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(accessedAt);
}
