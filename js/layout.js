export function serializeWorkspace(screens) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "webar-spatial-workspace",
    screens: screens.map((screen) => {
      const { type, name, fileName, mime, aspect, placeholder } = screen.userData;
      return {
        type,
        name,
        fileName,
        mime,
        aspect,
        placeholder: Boolean(placeholder),
        position: screen.position.toArray(),
        quaternion: screen.quaternion.toArray(),
        scale: screen.scale.toArray(),
        loop: screen.userData.video ? screen.userData.video.loop : undefined,
      };
    }),
  };
}

export function readLayoutFile(file) {
  return file.text().then((text) => {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.screens)) {
      throw new Error("Invalid layout file");
    }
    return data;
  });
}
