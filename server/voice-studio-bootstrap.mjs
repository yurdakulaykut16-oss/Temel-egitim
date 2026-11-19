const defaultFetch = (...args) => fetch(...args);

/** A live catalog/model API is sufficient for bootstrap; inference readiness is separate. */
export async function voiceStudioApiAlive(baseUrl, fetchFn = defaultFetch, timeoutMs = 1500) {
 const base = String(baseUrl || '').replace(/\/$/, '');
 for (const path of ['/health', '/system/info', '/models']) {
  try {
   const response = await fetchFn(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
   if (response.ok) return true;
  } catch {}
 }
 return false;
}

/** Handle the different model-list response shapes used by VoiceStudio releases. */
export function hasInstalledVoiceStudioModel(models, repoId) {
 return (Array.isArray(models) ? models : []).some(model => {
  const id = model?.repo_id || model?.id || model?.name || model?.model_id;
  const ready = model?.installed === true || model?.downloaded === true
   || ['installed', 'ready'].includes(String(model?.status || '').toLowerCase());
  return id === repoId && ready;
 });
}
