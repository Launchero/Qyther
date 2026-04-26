import { BrainIcon, PaperPlaneRightIcon, SparkleIcon } from '@phosphor-icons/react';

export function useInputIcon(hasSent: boolean, hasContent: boolean) {
  if (hasSent) return BrainIcon;
  if (hasContent) return PaperPlaneRightIcon;
  return SparkleIcon;
}
