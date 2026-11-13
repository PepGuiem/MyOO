/**
 * Recorta una foto al centro y la reduce antes de subirla (foto de perfil
 * cuadrada, portada apaisada). Así pesa poco y entra en el límite de 2 MB.
 */
export async function cropImage(file: File, width: number, height: number, name: string): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const target = width / height;
    const source = bitmap.width / bitmap.height;
    // Trozo central de la foto con la proporción buscada.
    const sw = source > target ? bitmap.height * target : bitmap.width;
    const sh = source > target ? bitmap.height : bitmap.width / target;
    const sx = (bitmap.width - sw) / 2;
    const sy = (bitmap.height - sh) / 2;
    // No se amplía: si la foto es pequeña, se queda en su tamaño.
    const scale = Math.min(1, width / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) throw new Error('No se pudo preparar la imagen.');
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
