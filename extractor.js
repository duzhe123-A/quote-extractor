"use strict";

const QuoteExtractor = (() => {
  const ENDINGS = /[。！？!?；;…]/u;
  const CLOSERS = /[”’」』】）》"')\]]/u;
  const SPEECH_MARKERS = /^(?:然后呢|接下来|刚刚说的|反正|那个|呃|嗯|就是吧|就是说|好的|今天呢)/u;
  const CONTRAST = /(?:不是.{1,48}(?:而是|是因为)|与其.{1,48}不如|宁可.{1,48}也不|越.{1,32}越|再.{1,16}[，,]也|比.{1,34}更|与其|而是|反而|偏偏|却)/u;
  const HOOK = /(?:^你(?:有没有|是不是|以为|知道)|为什么|怎么会|如果你|猜猜|没想到|原来|误会|最容易|问题在于)/u;
  const TAKEAWAY = /(?:记住|后来才明白|后来我明白|到最后|重要的是|真正(?:的|让我|能|重要|改变)|所谓|只要|不妨|先.{1,24}再|最终|总会|一步)/u;
  const ABBREVIATION = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|e\.g|i\.e|vs|etc)\.$/iu;
  const DEFAULT_LIMIT = 5;

  function isPeriodBoundary(line, index, start) {
    const next = line[index + 1] ?? "";
    if (/[\p{Letter}\p{Number}]/u.test(next) && !/\p{Script=Han}/u.test(next)) return false;
    return !next || !ABBREVIATION.test(line.slice(Math.max(start, index - 7), index + 1));
  }

  function splitSentences(input) {
    const sentences = [];
    for (const line of input.split(/\r\n?|\n/u)) {
      if (/^\s*(?:\d+|\d\d:\d\d:\d\d[,.]\d+\s*-->\s*\d\d:\d\d:\d\d[,.]\d+)\s*$/u.test(line)) continue;
      let start = 0;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const terminal = ENDINGS.test(ch) || (ch === "." && isPeriodBoundary(line, i, start));
        if (!terminal) continue;
        while (i + 1 < line.length && (ENDINGS.test(line[i + 1]) || line[i + 1] === ".")) i += 1;
        if (CLOSERS.test(line[i + 1] ?? "")) {
          while (CLOSERS.test(line[i + 1] ?? "")) i += 1;
          if (/^[，、,]/u.test(line[i + 1] ?? "")) continue;
        }
        const sentence = line.slice(start, i + 1).trim();
        if (sentence) sentences.push(sentence);
        start = i + 1;
      }
      const tail = line.slice(start).trim();
      if (tail) sentences.push(tail);
    }
    return sentences;
  }

  function normalize(sentence) {
    return sentence.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, "");
  }

  function bigrams(text) {
    const characters = Array.from(text);
    return new Set(characters.slice(1).map((character, index) => characters[index] + character));
  }

  function similar(a, b) {
    if (a.key === b.key) return true;
    const shorter = a.key.length < b.key.length ? a.key : b.key;
    const longer = a.key.length < b.key.length ? b.key : a.key;
    if (shorter.length >= 8 && shorter.length / longer.length >= .75 && longer.includes(shorter)) return true;
    let overlap = 0;
    for (const pair of a.pairs) if (b.pairs.has(pair)) overlap += 1;
    return 2 * overlap / (a.pairs.size + b.pairs.size) >= .8;
  }

  function analyze(text, key, index, total) {
    const length = Array.from(key).length;
    const contrast = CONTRAST.test(text);
    const question = /[？?][”’」』"]?$/u.test(text);
    const hook = HOOK.test(text);
    const takeaway = TAKEAWAY.test(text);
    const short = length >= 6 && length <= 28;
    const clauses = text.split(/[，,、：:]/u).map(part => normalize(part).length);
    const rhythmic = clauses.length >= 2 && clauses.length <= 4 && clauses.every(size => size >= 3)
      && Math.max(...clauses) - Math.min(...clauses) <= 6;
    const goodLength = length >= 8 && length <= 46 ? 3 : length < 75 ? 1 : -2;
    const filler = SPEECH_MARKERS.test(text) ? 3 : 0;
    const position = total > 1 ? index / (total - 1) : .5;
    const common = goodLength + (contrast ? 3 : 0) + (rhythmic ? 1.4 : 0) - filler;
    const scores = {
      hook: common + (hook ? 4 : 0) + (question ? 3 : 0) + 1 - position,
      title: common + (short ? 3 : -1.5) + (contrast ? 1 : 0) + (length > 45 ? -3 : 0),
      close: common + (takeaway ? 4 : 0) - (question ? 3 : 0) + position
    };
    const bestMode = Object.keys(scores).reduce((best, mode) => scores[mode] > scores[best] ? mode : best);
    const reasons = {
      hook: question ? "问句开场" : hook ? "引出问题" : contrast ? "反差切入" : "",
      title: short ? "句子简短" : contrast ? "观点鲜明" : "",
      close: takeaway ? "归纳观点" : rhythmic ? "节奏利落" : ""
    };
    return { text, key, pairs: bigrams(key), index, scores, bestMode, reasons };
  }

  function extract(input, mode = "all", limit = DEFAULT_LIMIT) {
    const sentences = splitSentences(input);
    const seen = new Set();
    const candidates = [];
    sentences.forEach((text, index) => {
      const key = normalize(text);
      if (key.length < 3 || !/\p{Letter}/u.test(key) || seen.has(key)) return;
      seen.add(key);
      candidates.push(analyze(text, key, index, sentences.length));
    });
    const rank = candidate => candidate.scores[mode === "all" ? candidate.bestMode : mode];
    candidates.sort((a, b) => rank(b) - rank(a) || a.index - b.index);
    const quotes = [];
    for (const candidate of candidates) {
      if (quotes.length >= limit) break;
      if (quotes.some(quote => similar(candidate, quote))) continue;
      const use = mode === "all" ? candidate.bestMode : mode;
      quotes.push({ ...candidate, use, reason: candidate.reasons[use] });
    }
    return { quotes, sentenceCount: sentences.length };
  }

  return { extract, splitSentences };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QuoteExtractor;

