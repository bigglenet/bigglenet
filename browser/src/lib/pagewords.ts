// Text the Bigglenet's own tags show inside pages (page-widgets.js and the guestbook in
// page-runtime.js). Pages can't reach the browser's t(), so they get these already translated
// (loader.ts), and look each one up with __kit.w().
import { i18n, t } from './i18n.svelte';

export const PAGE_WORDS = [
  'Comments',
  'Add a comment',
  'No comments yet.',
  'Show older comments',
  'Take this comment down',
  'Report this comment',
  'A poll needs an id and at least two options.',
  '{n} vote · tap another answer to change yours',
  '{n} votes · tap another answer to change yours',
  'Tap an answer to vote and see the results.',
  'You like this site',
  'Like this site',
  'Leaderboard',
  'Player',
  'Score',
  'No scores yet. Be the first!',
  'Your best: {score} (#{rank})',
  'Drawing wall',
  'Clear',
  'Small',
  'Medium',
  'Large',
  '{n} drawing here',
  'Message the owner',
  'Sent! Thanks.',
  'Embedded pages can’t do that.',
  'Say which webring: <biggle-webring ring="3">.',
  'Webring',
  'This site isn’t in the {ring} webring yet.',
  '← Previous',
  'Random',
  'Next →',
  'Guestbook',
  'Sign the guestbook',
  'Nobody has signed it yet. Be the first!',
  'Show older notes',
  'Take this note down',
  'Report this note',
];

/** The page words in the visitor's language (nothing for English: pages fall back to it). */
export const pageWords = (): Record<string, string> | null => (i18n.lang === 'en' ? null : Object.fromEntries(PAGE_WORDS.map((s) => [s, t(s)])));
