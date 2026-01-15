export const scopedKey = (baseKey, workspaceId) => {
  if (!workspaceId) return baseKey;
  return `${baseKey}_${workspaceId}`;
};
