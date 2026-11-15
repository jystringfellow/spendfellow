import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    files: [
      'src/components/accounts/LinkedInstitutionCard.tsx',
      'src/components/accounts/PlaidLinkButton.tsx',
      'src/components/budgets/FunMoneyAdjustmentDialog.tsx',
      'src/components/settings/AmazonSyncPanel.tsx',
      'src/components/settings/HouseholdMembersPanel.tsx',
      'src/components/transactions/CategorizationModeButton.tsx',
      'src/components/transactions/FunMoneyAllocationButton.tsx',
      'src/components/transactions/ManualTransactionDialog.tsx',
      'src/components/transactions/TransactionsTable.tsx',
    ],
    // Existing draft resets and browser initialization predate this React 19 rule.
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'scripts/amazon-sync.user.js']),
]);
