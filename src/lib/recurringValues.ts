import { getMonthlyPlanningAmountCents, resolveRecurringValueAmount } from './constantPeriods';
import type { RecurringValue, RecurringValueDependency, RecurringValuePeriod } from '@/types/database';

interface EffectiveRecurringValue extends RecurringValue {
  effective_bill_amount_cents: number;
  effective_fixed_amount_cents: number;
  effective_start_month: number | null;
}

export interface ResolvedRecurringValue extends RecurringValue {
  effective_bill_amount_cents: number;
  calculated_amount_cents: number;
  effective_fixed_amount_cents: number;
  effective_start_month: number | null;
  dependencies: EffectiveRecurringValue[];
}

export function resolveRecurringValues(
  recurringValues: RecurringValue[],
  dependencies: RecurringValueDependency[],
  periods: RecurringValuePeriod[] = [],
  year?: number,
  month?: number
): ResolvedRecurringValue[] {
  const effectiveValues: EffectiveRecurringValue[] = recurringValues.map((value) => {
    if (value.kind !== 'fixed' || year === undefined || month === undefined) {
      const monthlyAmountCents =
        value.kind === 'fixed'
          ? getMonthlyPlanningAmountCents(value.amount_cents, value.billing_frequency)
          : value.amount_cents;

      return {
        ...value,
        effective_bill_amount_cents: value.amount_cents,
        effective_fixed_amount_cents: monthlyAmountCents,
        effective_start_month: null,
      };
    }

    const resolvedAmount = resolveRecurringValueAmount(value.id, value.amount_cents, periods, year, month);

    return {
      ...value,
      amount_cents: resolvedAmount.amount_cents,
      effective_bill_amount_cents: resolvedAmount.amount_cents,
      effective_fixed_amount_cents: getMonthlyPlanningAmountCents(
        resolvedAmount.amount_cents,
        value.billing_frequency
      ),
      effective_start_month: resolvedAmount.effective_start_month,
    };
  });
  const valuesById = new Map(effectiveValues.map((value) => [value.id, value]));
  const dependencyIdsByValueId = dependencies.reduce<Map<string, string[]>>((result, dependency) => {
    const currentDependencies = result.get(dependency.recurring_value_id) ?? [];
    currentDependencies.push(dependency.depends_on_recurring_value_id);
    result.set(dependency.recurring_value_id, currentDependencies);
    return result;
  }, new Map());

  return effectiveValues.map((value) => {
    const valueDependencies = (dependencyIdsByValueId.get(value.id) ?? [])
      .map((dependencyId) => valuesById.get(dependencyId))
      .filter((dependency): dependency is EffectiveRecurringValue => Boolean(dependency));

    if (value.kind !== 'formula') {
      return {
        ...value,
        calculated_amount_cents: value.effective_fixed_amount_cents,
        effective_bill_amount_cents: value.effective_bill_amount_cents,
        effective_fixed_amount_cents: value.effective_fixed_amount_cents,
        dependencies: valueDependencies,
      };
    }

    const dependencyTotalCents = valueDependencies.reduce(
      (total, dependency) => total + dependency.effective_fixed_amount_cents,
      0
    );

    const calculatedAmountCents =
      value.formula_operator === 'negative_sum' ? -dependencyTotalCents : dependencyTotalCents;

    return {
      ...value,
      calculated_amount_cents: calculatedAmountCents,
      effective_bill_amount_cents: value.effective_bill_amount_cents,
      effective_fixed_amount_cents: value.effective_fixed_amount_cents,
      dependencies: valueDependencies,
    };
  });
}

export function formatFormulaDescription(value: ResolvedRecurringValue): string {
  if (value.kind !== 'formula') {
    return 'Fixed';
  }

  const dependencyNames = value.dependencies.map((dependency) => dependency.name).join(' + ');

  if (!dependencyNames) {
    return value.formula_operator === 'negative_sum' ? '-(empty)' : 'empty';
  }

  return value.formula_operator === 'negative_sum' ? `-(${dependencyNames})` : dependencyNames;
}
