import type { Renderer } from "@ifc-lite/renderer";

/** Called immediately after rendering, before the compositor releases the texture.
 * captureColorFrame is intentionally not used: it crops the centre to 512px.
 */
export async function captureBcfSnapshot<T>(
  renderer: Renderer,
  readState: () => T,
): Promise<{ snapshot: Blob; state: T }> {
  const dataUrl = await renderer.captureScreenshot();
  if (!dataUrl)
    throw new Error(
      "La capture 3D n’est pas disponible. Réessayez lorsque la scène est prête.",
    );
  // Read camera/scene metadata in the same microtask as the completed PNG.
  const state = readState();
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.startsWith("data:image/png;base64,"))
    throw new Error("La capture 3D reçue est invalide.");
  const bytes = Uint8Array.from(
    atob(dataUrl.slice(separator + 1)),
    (character) => character.charCodeAt(0),
  );
  const blob = new Blob([bytes], { type: "image/png" });
  // Invalid browser GPU textures sometimes produce a valid but fully transparent PNG.
  const bitmap = await createImageBitmap(blob);
  try {
    const context = new OffscreenCanvas(1, 1).getContext("2d");
    if (!context) throw new Error("Impossible de vérifier l’aperçu de la vue.");
    context.drawImage(bitmap, 0, 0, 1, 1);
    if (context.getImageData(0, 0, 1, 1).data[3] === 0)
      throw new Error(
        "Le navigateur n’a pas pu rendre la capture 3D. Réessayez après avoir réactivé la vue.",
      );
  } finally {
    bitmap.close();
  }
  return { snapshot: blob, state };
}
