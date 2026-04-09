/**
 * Model profiles and recommendations for AI model selection
 * 
 * Provides educational information about each model to help users
 * make informed decisions based on their task requirements.
 */

export interface ModelProfile {
  name: string;
  speed: 'Fast' | 'Medium' | 'Slow';
  quality: 'High' | 'Very High' | 'Excellent';
  bestFor: string[];
  contextWindow: string;
  supportsBrowserAutomation: boolean;
  description: string;
}

export const MODEL_PROFILES: ModelProfile[] = [
  {
    name: 'Qwen',
    speed: 'Fast',
    quality: 'High',
    bestFor: ['General questions', 'Code help', 'Browser automation', 'Quick answers'],
    contextWindow: '128K tokens',
    supportsBrowserAutomation: true,
    description: 'Fast and versatile model excellent for general tasks, coding assistance, and browser automation. Great balance of speed and quality.',
  },
  {
    name: 'Claude 4.6',
    speed: 'Medium',
    quality: 'Very High',
    bestFor: ['Complex reasoning', 'Long documents', 'Analysis', 'Writing', 'Research'],
    contextWindow: '200K tokens',
    supportsBrowserAutomation: true,
    description: 'Premium model with exceptional reasoning capabilities. Ideal for complex analysis, long-form content, and tasks requiring deep understanding.',
  },
  {
    name: 'GPT-5',
    speed: 'Fast',
    quality: 'High',
    bestFor: ['Creative tasks', 'Multi-modal', 'Quick answers', 'Brainstorming'],
    contextWindow: '128K tokens',
    supportsBrowserAutomation: false,
    description: 'Creative and fast model perfect for brainstorming, creative writing, and quick responses. Excellent for multi-modal tasks.',
  },
];

/**
 * Get model profile by name
 */
export function getModelProfile(modelName: string): ModelProfile | undefined {
  return MODEL_PROFILES.find(profile => profile.name === modelName);
}

/**
 * Get recommended model based on task type
 */
export function getRecommendedModel(taskType: string): string {
  const taskLower = taskType.toLowerCase();
  
  // Browser automation tasks
  if (taskLower.includes('browser') || taskLower.includes('navigate') || taskLower.includes('extract') || taskLower.includes('scrape')) {
    return 'Qwen';
  }
  
  // Code-related tasks
  if (taskLower.includes('code') || taskLower.includes('program') || taskLower.includes('debug') || taskLower.includes('typescript') || taskLower.includes('react')) {
    return 'Qwen';
  }
  
  // Complex reasoning or analysis
  if (taskLower.includes('analyze') || taskLower.includes('research') || taskLower.includes('compare') || taskLower.includes('complex')) {
    return 'Claude 4.6';
  }
  
  // Long document processing
  if (taskLower.includes('document') || taskLower.includes('paper') || taskLower.includes('book') || taskLower.includes('long')) {
    return 'Claude 4.6';
  }
  
  // Creative tasks
  if (taskLower.includes('creative') || taskLower.includes('write') || taskLower.includes('story') || taskLower.includes('brainstorm')) {
    return 'GPT-5';
  }
  
  // Quick questions
  if (taskLower.includes('quick') || taskLower.includes('simple') || taskLower.includes('what is')) {
    return 'Qwen';
  }
  
  // Default recommendation
  return 'Qwen';
}

/**
 * Get speed indicator color
 */
export function getSpeedColor(speed: 'Fast' | 'Medium' | 'Slow'): string {
  switch (speed) {
    case 'Fast':
      return '#10b981'; // Green
    case 'Medium':
      return '#f59e0b'; // Amber
    case 'Slow':
      return '#ef4444'; // Red
    default:
      return '#6b7280'; // Gray
  }
}

/**
 * Get quality indicator color
 */
export function getQualityColor(quality: 'High' | 'Very High' | 'Excellent'): string {
  switch (quality) {
    case 'High':
      return '#3b82f6'; // Blue
    case 'Very High':
      return '#8b5cf6'; // Purple
    case 'Excellent':
      return '#7132f5'; // Kraken Purple
    default:
      return '#6b7280'; // Gray
  }
}

/**
 * Check if model is suitable for task
 */
export function isModelSuitableForTask(modelName: string, taskType: string): boolean {
  const profile = getModelProfile(modelName);
  if (!profile) return false;
  
  const taskLower = taskType.toLowerCase();
  
  // Browser automation requires browser-enabled model
  if (taskLower.includes('browser') || taskLower.includes('navigate') || taskLower.includes('extract')) {
    return profile.supportsBrowserAutomation;
  }
  
  return true;
}
