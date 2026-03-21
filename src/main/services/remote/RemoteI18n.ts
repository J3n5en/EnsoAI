import { translate } from '@shared/i18n';
import { getCurrentLocale } from '../i18n';

type TranslationParams = Record<string, string | number>;

export type RemoteUnsupportedFeature =
  | 'submoduleHistory'
  | 'partialCommit'
  | 'gitInit'
  | 'submoduleCommitFiles'
  | 'commitDiffVariants'
  | 'aiCommitMessageGeneration'
  | 'codeReview'
  | 'githubCliIntegration'
  | 'pullRequestListing'
  | 'pullRequestFetch'
  | 'aiBranchNameGeneration'
  | 'submodules';

const remoteUnsupportedFeatureLabels: Record<RemoteUnsupportedFeature, string> = {
  submoduleHistory: 'Submodule history',
  partialCommit: 'Partial commit',
  gitInit: 'Git init',
  submoduleCommitFiles: 'Submodule commit files',
  commitDiffVariants: 'Commit diff variants',
  aiCommitMessageGeneration: 'AI commit message generation',
  codeReview: 'Code review',
  githubCliIntegration: 'GitHub CLI integration',
  pullRequestListing: 'Pull request listing',
  pullRequestFetch: 'Pull request fetch',
  aiBranchNameGeneration: 'AI branch name generation',
  submodules: 'Submodules',
};

export function translateRemote(key: string, params?: TranslationParams): string {
  return translate(getCurrentLocale(), key, params);
}

export function getRemoteErrorDetail(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error.trim() || undefined;
  }
  if (error instanceof Error) {
    return error.message.trim() || undefined;
  }
  if (error === null || error === undefined) {
    return undefined;
  }
  return String(error).trim() || undefined;
}

export function createRemoteError(
  key: string,
  params?: TranslationParams,
  detail?: unknown
): Error {
  const message = translateRemote(key, params);
  const extra = getRemoteErrorDetail(detail);
  if (!extra || extra === message) {
    return new Error(message);
  }
  return new Error(`${message}\n${extra}`);
}

export function createUnsupportedRemoteFeatureError(feature: RemoteUnsupportedFeature): Error {
  return createRemoteError('{{feature}} is not supported for remote repositories yet', {
    feature: translateRemote(remoteUnsupportedFeatureLabels[feature]),
  });
}
