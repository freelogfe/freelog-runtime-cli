export { runInitScaffold, type InitScaffoldOptions } from './scaffold.js';
export { resolveInitOutcome, type ResolvedInitArgs } from './wizard.js';
export {
  INIT_CATEGORY_META,
  initNextSteps,
  assertScaffoldCategoryMatch,
  defaultVersionFilePath,
  inferCategoryFromTypeCode,
  resolveScaffold,
  scaffoldForCategory,
  type InitScaffold,
} from './catalog.js';
export { pickInitNamespace, pickInitResourceIdentity, pickInitTemplate } from './prompts.js';
export {
  loadResourceTypeForest,
  pickInitCategory,
  pickResourceTypeForCategory,
  pickResourceTypeInteractive,
  resolveFixedScaffoldCategory,
  INIT_CATEGORY_OPTIONS,
  type PickedResourceType,
  type ScaffoldInitCategory,
  type ScaffoldPreset,
} from './picker.js';
