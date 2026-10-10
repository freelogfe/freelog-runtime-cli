export type ArtifactStageStatus = 'skipped' | 'planned' | 'completed' | 'reused' | 'failed';

export interface ArtifactPipelineStages {
  package: ArtifactStageStatus;
  upload: ArtifactStageStatus;
  properties: ArtifactStageStatus;
  platformWrite: ArtifactStageStatus;
}
