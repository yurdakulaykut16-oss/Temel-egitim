// Üretim hedefi ve kullanıcıya yansıyan zorluk ayrıdır.
// Zor içerik üretilmeye devam eder; etiketi ve sayacı orta olur.
export const displayDifficulty = value => value === 'zor' ? 'orta' : value;
export const generationDifficultyOf = question => question?.generationDifficulty || question?.difficulty;
export function normalizeGeneratedQuestion(question) {
 if (!question || typeof question !== 'object') return question;
 const generationDifficulty = generationDifficultyOf(question);
 const verification = question.verification;
 return {
  ...question,
  ...(generationDifficulty ? { generationDifficulty, difficulty: displayDifficulty(generationDifficulty) } : {}),
  ...(verification ? { verification: {
   ...verification,
   ...(verification.difficulty ? { difficulty: displayDifficulty(verification.difficulty) } : {}),
   ...(verification.targetDifficulty ? { generationTargetDifficulty: verification.generationTargetDifficulty || verification.targetDifficulty, targetDifficulty: displayDifficulty(verification.targetDifficulty) } : {}),
   ...(Array.isArray(verification.judges) ? { judges: verification.judges.map(j => ({ ...j, ...(j.difficulty ? { difficulty: displayDifficulty(j.difficulty) } : {}) })) } : {})
  }} : {})
 };
}
