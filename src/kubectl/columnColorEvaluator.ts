import type { ColorRule } from './resourceTypes';

/**
 * Safely prepares a value for JavaScript expression evaluation
 * Numbers are passed as-is, strings are JSON-stringified to handle quotes
 */
function prepareValue(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  // For strings, JSON.stringify handles escaping and adds quotes
  return JSON.stringify(value);
}

/**
 * Evaluates a color rule expression with placeholder values
 * Returns the color if the expression evaluates to true, null otherwise
 */
export function evaluateColorRule(
  rule: ColorRule,
  placeholderValues: (string | number)[]
): string | null {
  try {
    // Replace placeholders {0}, {1}, etc. with actual values
    let expression = rule.expression;
    
    for (let i = 0; i < placeholderValues.length; i++) {
      const placeholder = `{${i}}`;
      const value = prepareValue(placeholderValues[i]);
      // Use regex with global flag to replace all occurrences
      expression = expression.replace(new RegExp(`\\{${i}\\}`, 'g'), value);
    }
    
    // Evaluate the expression
    // eslint-disable-next-line no-eval
    const result = eval(expression);
    
    return result === true ? rule.color : null;
  } catch (error) {
    console.warn(
      `Failed to evaluate color rule expression: "${rule.expression}"`,
      error
    );
    return null;
  }
}

/**
 * Evaluates all color rules and returns the first matching color
 * Rules are evaluated in order, first match wins
 */
export function evaluateColumnColor(
  colorRules: ColorRule[] | undefined,
  placeholderValues: (string | number)[]
): string | null {
  if (!colorRules || !Array.isArray(colorRules)) {
    return null;
  }
  
  for (const rule of colorRules) {
    const color = evaluateColorRule(rule, placeholderValues);
    if (color) {
      return color;
    }
  }
  
  return null;
}
