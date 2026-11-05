import { WORD_MAX_MM } from './panels';

/** Crée un .docx d'une page, sans marges, avec le poster en image pleine page. */
export async function buildDocx(jpeg: Uint8Array, wMm: number, hMm: number) {
  const { Document, Packer, Paragraph, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom } = await import('docx');
  const f = Math.min(1, WORD_MAX_MM / Math.max(wMm, hMm));
  const pw = wMm * f;
  const ph = hMm * f;
  const twips = (mm: number) => Math.round((mm / 25.4) * 1440);
  const px = (mm: number) => Math.round((mm / 25.4) * 96);
  const doc = new Document({
    creator: 'Poster Pro',
    title: 'Poster',
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(pw), height: twips(ph) },
            margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [
              new ImageRun({
                data: jpeg,
                transformation: { width: px(pw), height: px(ph) },
                floating: {
                  horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                  verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
                  behindDocument: true,
                  allowOverlap: true,
                },
              }),
            ],
          }),
        ],
      },
    ],
  });
  return { blob: await Packer.toBlob(doc), scaled: f < 1 };
}
