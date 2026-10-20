import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

import { configure } from '@testing-library/react';
// Lazy routes must finish importing before assertions about the screen.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no browser blob URL implementation.
URL.createObjectURL = vi.fn(() => 'blob:document-preview');
URL.revokeObjectURL = vi.fn();
