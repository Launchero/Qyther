/**
 * Error classification and recovery suggestions for Ask Mode
 * 
 * Categorizes errors by type and provides actionable recovery steps
 * to improve user trust and task completion rates.
 */

export enum ErrorType {
  BROWSER_TIMEOUT = 'BROWSER_TIMEOUT',
  BROWSER_NAVIGATION_FAILED = 'BROWSER_NAVIGATION_FAILED',
  BROWSER_ELEMENT_NOT_FOUND = 'BROWSER_ELEMENT_NOT_FOUND',
  AGENT_ERROR = 'AGENT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  USER_INPUT_ERROR = 'USER_INPUT_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorRecovery {
  type: ErrorType;
  title: string;
  message: string;
  recoveryActions: Array<{
    label: string;
    action: () => void;
    primary?: boolean;
  }>;
}

/**
 * Classifies an error message and returns structured recovery information
 */
export function classifyError(
  error: string,
  context?: {
    onRetry?: () => void;
    onEditQuery?: () => void;
    onNewChat?: () => void;
  }
): ErrorRecovery {
  const errorLower = error.toLowerCase();
  const { onRetry, onEditQuery, onNewChat } = context || {};

  // Browser-specific errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      type: ErrorType.BROWSER_TIMEOUT,
      title: 'Browser Timeout',
      message: 'The browser operation took too long to complete. This can happen with slow websites or complex automation tasks.',
      recoveryActions: [
        {
          label: 'Try Again',
          action: onRetry || (() => {}),
          primary: true,
        },
        {
          label: 'Be More Specific',
          action: onEditQuery || (() => {}),
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  if (errorLower.includes('navigation') || errorLower.includes('navigate') || errorLower.includes('redirect')) {
    return {
      type: ErrorType.BROWSER_NAVIGATION_FAILED,
      title: 'Navigation Failed',
      message: 'Unable to navigate to the requested page. The URL might be invalid or the site may be blocking automated access.',
      recoveryActions: [
        {
          label: 'Check URL',
          action: onEditQuery || (() => {}),
          primary: true,
        },
        {
          label: 'Try Again',
          action: onRetry || (() => {}),
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  if (errorLower.includes('element') || errorLower.includes('selector') || errorLower.includes('not found')) {
    return {
      type: ErrorType.BROWSER_ELEMENT_NOT_FOUND,
      title: 'Element Not Found',
      message: 'The specified element could not be found on the page. The page structure may have changed or the selector is incorrect.',
      recoveryActions: [
        {
          label: 'Describe Differently',
          action: onEditQuery || (() => {}),
          primary: true,
        },
        {
          label: 'Try Again',
          action: onRetry || (() => {}),
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  // Agent errors (LangChain, AI model)
  if (errorLower.includes('agent') || errorLower.includes('langchain') || errorLower.includes('model')) {
    return {
      type: ErrorType.AGENT_ERROR,
      title: 'AI Processing Error',
      message: 'There was an issue processing your request with the AI model. This could be due to service availability or input format.',
      recoveryActions: [
        {
          label: 'Retry Request',
          action: onRetry || (() => {}),
          primary: true,
        },
        {
          label: 'Simplify Query',
          action: onEditQuery || (() => {}),
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  // Network errors
  if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('connection') || errorLower.includes('offline')) {
    return {
      type: ErrorType.NETWORK_ERROR,
      title: 'Connection Issue',
      message: 'Unable to connect to the service. Please check your internet connection and try again.',
      recoveryActions: [
        {
          label: 'Check Connection',
          action: onRetry || (() => {}),
          primary: true,
        },
        {
          label: 'Try Again',
          action: onRetry || (() => {}),
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  // User input errors (validation, empty queries, etc.)
  if (errorLower.includes('invalid') || errorLower.includes('required') || errorLower.includes('empty') || errorLower.includes('format')) {
    return {
      type: ErrorType.USER_INPUT_ERROR,
      title: 'Input Error',
      message: 'There was an issue with your request. Please check your input and try again.',
      recoveryActions: [
        {
          label: 'Edit Query',
          action: onEditQuery || (() => {}),
          primary: true,
        },
        {
          label: 'Start New Chat',
          action: onNewChat || (() => {}),
        },
      ],
    };
  }

  // Fallback: Unknown error
  return {
    type: ErrorType.UNKNOWN,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or start a new conversation.',
    recoveryActions: [
      {
        label: 'Try Again',
        action: onRetry || (() => {}),
        primary: true,
      },
      {
        label: 'Start New Chat',
        action: onNewChat || (() => {}),
      },
    ],
  };
}

/**
 * Get a user-friendly suggestion based on error type
 */
export function getErrorSuggestion(errorType: ErrorType): string {
  switch (errorType) {
    case ErrorType.BROWSER_TIMEOUT:
      return 'Try breaking your request into smaller steps or being more specific about what you want to extract.';
    case ErrorType.BROWSER_NAVIGATION_FAILED:
      return 'Make sure the URL is correct and accessible. Some sites may block automated access.';
    case ErrorType.BROWSER_ELEMENT_NOT_FOUND:
      return 'Try describing the element differently or provide more context about its location on the page.';
    case ErrorType.AGENT_ERROR:
      return 'This might be a temporary service issue. Try again in a few moments.';
    case ErrorType.NETWORK_ERROR:
      return 'Check your internet connection and make sure you can access other websites.';
    case ErrorType.USER_INPUT_ERROR:
      return 'Review your query for any missing information or formatting issues.';
    default:
      return 'Try rephrasing your request or starting a new conversation.';
  }
}
