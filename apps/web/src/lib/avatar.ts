export const MAX_AVATAR_BYTES = 500_000;

/** Re-encode locally: strips metadata and bounds both dimensions and upload size. */
export async function compressAvatar(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Selecione uma imagem JPEG, PNG ou WebP.');
  if (file.size > 20_000_000)
    throw new Error('Selecione uma imagem de até 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('Imagem inválida.');
    let scale = Math.min(
      1,
      1024 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a imagem.');
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(
          resolve,
          'image/jpeg',
          Math.max(0.4, 0.85 - attempt * 0.1),
        ),
      );
      if (!blob) throw new Error('Não foi possível comprimir a imagem.');
      if (blob.size <= MAX_AVATAR_BYTES) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () =>
            reject(new Error('Não foi possível ler a foto.'));
          reader.readAsDataURL(blob);
        });
      }
      scale *= 0.75;
    }
    throw new Error('Não foi possível reduzir a foto para 0,5 MB.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
