export interface BankClassificationSuggestion {
  id: string;
  name: string;
  /** Agreement in the matching history, not a calibrated probability. */
  agreement: number;
  support: number;
  sampleSize: number;
}

export interface BankClassificationSuggestions {
  classification: 'INCOME' | 'EXPENSE';
  category: BankClassificationSuggestion | null;
  costCenter: BankClassificationSuggestion | null;
}
