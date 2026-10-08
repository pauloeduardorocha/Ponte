import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';
// Lazy routes must finish importing before assertions about the screen.
configure({ asyncUtilTimeout: 5000 });
