export {
  DB_NAME,
  DB_VERSION,
  getDb,
  closeDb,
  IndexedDbClient,
  type StoredProjectRecord,
  type StoredBlobRecord,
  type PlayCanvasEditorDB,
} from './IndexedDbClient';

export {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  saveSceneDraft,
  loadSceneDraft,
  deleteSceneDraft,
  saveAutoDraft,
  loadAutoDraft,
  setLastActiveSceneId,
  getLastActiveSceneId,
  ProjectRepository,
  type ProjectSummary,
} from './ProjectRepository';

export {
  importFile,
  savePrefab,
  getAssetBlob,
  getAssetObjectUrl,
  getPrefabData,
  getAssetManifest,
  listAssets,
  deleteAsset,
  AssetRepository,
} from './AssetRepository';

export {
  BUNDLE_FORMAT,
  MULTI_BUNDLE_FORMAT,
  BUNDLE_VERSION,
  exportStandaloneBundle,
  exportMultiSceneBundle,
  importStandaloneBundle,
  BundleExporter,
  type EmbeddedBundleAsset,
  type StandaloneBundle,
  type MultiSceneStandaloneBundle,
} from './BundleExporter';
