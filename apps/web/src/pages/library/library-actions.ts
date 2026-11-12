import { t as translate } from '../../i18n';
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
  get label() {
    return translate('Membro');
  },
  endpoint: '/library/members',
  required: true,
};
export const copyFields: Field[] = [
  {
    name: 'shelfmark',
    get label() {
      return translate('Cota');
    },
  },
  {
    name: 'assetCode',
    get label() {
      return translate('Código patrimonial');
    },
    required: true,
  },
  {
    name: 'barcode',
    get label() {
      return translate('Código de barras');
    },
  },
  {
    name: 'qrCode',
    get label() {
      return translate('QR code');
    },
  },
  {
    name: 'condition',
    get label() {
      return translate('Condição');
    },
  },
  {
    name: 'location',
    get label() {
      return translate('Localização');
    },
    required: true,
  },
  {
    name: 'acquiredAt',
    get label() {
      return translate('Data de aquisição');
    },
    type: 'date',
  },
  {
    name: 'notes',
    get label() {
      return translate('Observações');
    },
    multiline: true,
  },
];
export const bookFields: Field[] = [
  {
    name: 'registrationNumber',
    get label() {
      return translate('Número de registo');
    },
  },
  {
    name: 'collection',
    get label() {
      return translate('Coleção');
    },
  },
  {
    name: 'catalogueNotes',
    get label() {
      return translate('Notas de catalogação');
    },
    multiline: true,
  },
  {
    name: 'categoryCodes',
    get label() {
      return translate('Categoria');
    },
    endpoint: '/library/categories',
    multiple: true,
  },
  {
    name: 'classificationReviewed',
    get label() {
      return translate('Classificação revista');
    },
    options: ['true', 'false'],
  },
  {
    name: 'title',
    get label() {
      return translate('Título');
    },
    required: true,
  },
  {
    name: 'subtitle',
    get label() {
      return translate('Subtítulo');
    },
  },
  {
    name: 'author',
    get label() {
      return translate('Autor');
    },
  },
  { name: 'isbn', label: 'ISBN' },
  {
    name: 'publisher',
    get label() {
      return translate('Editora');
    },
  },
  {
    name: 'edition',
    get label() {
      return translate('Edição');
    },
  },
  {
    name: 'year',
    get label() {
      return translate('Ano');
    },
    type: 'number',
  },
  {
    name: 'language',
    get label() {
      return translate('Idioma');
    },
  },
  {
    name: 'description',
    get label() {
      return translate('Descrição');
    },
    multiline: true,
  },
  {
    name: 'pages',
    get label() {
      return translate('Páginas');
    },
    type: 'number',
  },
  {
    name: 'cover',
    get label() {
      return translate('Capa (URL HTTPS)');
    },
    type: 'url',
  },
  {
    name: 'keywords',
    get label() {
      return translate('Assuntos relacionados');
    },
    endpoint: '/library/book-options/keywords',
    multiple: true,
    freeSolo: true,
  },
];
export const justification: Field = {
  name: 'justification',
  get label() {
    return translate('Justificativa');
  },
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
