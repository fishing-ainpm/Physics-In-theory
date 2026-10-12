/**
 * Asks Claude to interpret a student's own calculation.
 * Bundled for the browser by scripts/build.js into www/js/ai.js (global `PhysicsAI`).
 *
 * The API key is the user's own, typed into the app and stored only on their device,
 * so the browser talks to the API directly.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You are a friendly physics tutor inside a student app called "Physics in Theory".
The student is working with a rocket-launch simulator. They wrote their own formula, said in their own words what every letter or symbol means, and gave values and units. The app has already evaluated the formula.

Interpret the calculation for the student:
1. Say in plain words what the formula computes and which physical law or idea it is (for example the Tsiolkovsky rocket equation, Newton's second law, thrust-to-weight ratio).
2. Check each symbol's stated meaning against the role it plays in the formula. If a meaning is wrong, vague or swapped, say so kindly and give the correct meaning.
3. Check units and whether the result's size is physically reasonable for a rocket. Compare with the simulator values provided when relevant.
4. If there is a mistake (wrong formula, wrong values, unit mix-up, evaluation error), explain how to fix it.
5. End with one short sentence on what the result means for the rocket's flight.

Write in the same language the student used for the symbol meanings. Keep it short: about 120 to 250 words. Use Markdown with short paragraphs or bullets, and write maths in LaTeX between $...$.`;

function describe({ formula, symbols, result, error, resultSymbol, simulator }) {
  const lines = [`Formula: ${formula}`, '', 'Symbols (as defined by the student):'];
  for (const s of symbols) {
    const value = s.value === '' || s.value == null ? '(no value)' : `${s.value}${s.unit ? ' ' + s.unit : ''}`;
    lines.push(`- ${s.symbol}: "${s.meaning}" = ${value}`);
  }
  lines.push('');
  if (error) lines.push(`Evaluation error: ${error}`);
  else lines.push(`Result: ${resultSymbol ? resultSymbol.symbol + ' = ' : ''}${result}${resultSymbol?.unit ? ' ' + resultSymbol.unit : ''}` +
    (resultSymbol?.meaning ? ` (the student says ${resultSymbol.symbol} means "${resultSymbol.meaning}")` : ''));
  lines.push('', 'Current simulator values for reference:');
  for (const [k, v] of Object.entries(simulator || {})) lines.push(`- ${k}: ${v}`);
  return lines.join('\n');
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {object} opts.calculation  { formula, symbols[], result, error, resultSymbol, simulator }
 * @param {(text: string) => void} opts.onText  called with the full text so far as it streams
 * @returns {Promise<string>} the final text
 */
export async function interpret({ apiKey, calculation, onText }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: describe(calculation) }],
    });
    stream.on('text', (_delta, snapshot) => onText?.(snapshot));
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error('The AI declined to answer this one. Try rephrasing your symbol descriptions.');
    }
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new Error('The AI returned an empty answer. Please try again.');
    return text;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'That API key was not accepted. Check it in the AI settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the model. Check your Anthropic account.';
  if (err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI. AI interpretation needs an internet connection.';
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? 'unknown'}). Please try again.`;
  return err?.message || 'Something went wrong talking to the AI.';
}
