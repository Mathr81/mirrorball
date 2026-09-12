import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Les tests marqués « @network » tapent les vraies instances KPoe :
    // exclus par défaut, lancés explicitement via `vitest run --grep @network`.
    exclude: ['**/node_modules/**', '**/*.integration.spec.ts'],
  },
});
