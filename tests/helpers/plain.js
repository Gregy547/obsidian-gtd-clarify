/**
 * Prompt wording without its **emphasis** markers.
 *
 * Questions and answers carry their bold words in their own text. Tests that check the
 * wording — by matching a question, or by reading the source — check the words, not where
 * the bold falls, so they read through this.
 */
const plain = (s) => String(s == null ? "" : s).replace(/\*\*/g, "");

/** The source with emphasis markers removed from prompt text. Only a ** touching a word
 * (or closing punctuation) is markup; the opening of a doc comment is left alone. */
const plainSource = (src) =>
  String(src).replace(/\*\*(?=[A-Za-z0-9’“`$])|(?<=[A-Za-z0-9?.’”)])\*\*/g, "");

module.exports = { plain, plainSource };
