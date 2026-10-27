import * as api from '../../lib/library-api';
export interface Field {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  endpoint?: string;
  query?: Record<string, string>;
  options?: readonly string[];
  multiple?: boolean;
  freeSolo?: boolean;
}
export interface Action {
  title: string;
  fields: Field[];
  values?: Record<string, string>;
  run: (values: Record<string, string>) => Promise<unknown>;
}
export const memberField: Field = {
  name: 'memberId',
  label: 'Membro',
  endpoint: '/library/members',
  required: true,
};
export const copyFields: Field[] = [
  { name: 'shelfmark', label: 'Cota' },
  { name: 'assetCode', label: 'Código patrimonial', required: true },
  { name: 'barcode', label: 'Código de barras' },
  { name: 'qrCode', label: 'QR code' },
  { name: 'condition', label: 'Condição' },
  { name: 'location', label: 'Localização', required: true },
  { name: 'acquiredAt', label: 'Data de aquisição', type: 'date' },
  { name: 'notes', label: 'Observações', multiline: true },
];
export const bookFields: Field[] = [
  { name: 'registrationNumber', label: 'Número de registo' },
  { name: 'collection', label: 'Coleção' },
  { name: 'catalogueNotes', label: 'Notas de catalogação', multiline: true },
  {
    name: 'categoryCodes',
    label: 'Categoria',
    endpoint: '/library/categories',
    multiple: true,
  },
  {
    name: 'classificationReviewed',
    label: 'Classificação revista',
    options: ['true', 'false'],
  },
  { name: 'title', label: 'Título', required: true },
  { name: 'subtitle', label: 'Subtítulo' },
  { name: 'author', label: 'Autor' },
  { name: 'isbn', label: 'ISBN' },
  { name: 'publisher', label: 'Editora' },
  { name: 'edition', label: 'Edição' },
  { name: 'year', label: 'Ano', type: 'number' },
  { name: 'language', label: 'Idioma' },
  { name: 'description', label: 'Descrição', multiline: true },
  { name: 'pages', label: 'Páginas', type: 'number' },
  { name: 'cover', label: 'Capa (URL HTTPS)', type: 'url' },
  {
    name: 'keywords',
    label: 'Assuntos relacionados',
    endpoint: '/library/book-options/keywords',
    multiple: true,
    freeSolo: true,
  },
];
export const justification: Field = {
  name: 'justification',
  label: 'Justificativa',
  required: true,
  multiline: true,
};
export function bookInput(
  v: Record<string, string>,
  clearing = false,
): api.BookInput {
  const blank = clearing ? null : undefined;
  return {
    title: v.title ?? '',
    author: v.author || null,
    registrationNumber: v.registrationNumber || blank,
    collection: v.collection || blank,
    catalogueNotes: v.catalogueNotes || blank,
    primaryCategoryCode: v.categoryCodes?.split('\n')[0] || null,
    secondaryCategoryCodes: (v.categoryCodes ?? '')
      .split('\n')
      .slice(1)
      .map((code) => code.trim())
      .filter(Boolean),
    classificationReviewed: v.classificationReviewed === 'true',
    subtitle: v.subtitle || blank,
    isbn: v.isbn || blank,
    publisher: v.publisher || blank,
    edition: v.edition || blank,
    year: v.year ? Number(v.year) : blank,
    language: v.language || undefined,
    description: v.description || blank,
    pages: v.pages ? Number(v.pages) : blank,
    cover: v.cover || blank,
    keywords: (v.keywords ?? '')
      .split('\n')
      .map((word) => word.trim())
      .filter(Boolean),
  };
}
export function copyInput(
  v: Record<string, string>,
  clearing = false,
): api.CopyInput {
  const blank = clearing ? null : undefined;
  return {
    shelfmark: v.shelfmark || blank,
    assetCode: v.assetCode ?? '',
    location: v.location ?? '',
    barcode: v.barcode || blank,
    qrCode: v.qrCode || blank,
    condition: v.condition || undefined,
    acquiredAt: v.acquiredAt ? new Date(v.acquiredAt).toISOString() : blank,
    notes: v.notes || blank,
  };
}
export function valuesOf(value: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      Array.isArray(val)
        ? val.join('\n')
        : val === null || val === undefined
          ? ''
          : String(val),
    ]),
  );
}
export type OpenLibraryAction = (
  title: string,
  run: Action['run'],
  fields?: Field[],
  values?: Record<string, string>,
) => void;
