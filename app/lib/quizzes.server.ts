import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  type QuestionType,
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** The Student's choices: question id → the option id they picked. */
export type QuizAnswers = Record<number, number>;

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export type AttemptResult = {
  attemptId: number;
  score: number;
  passed: boolean;
  grade: string;
  totalCorrect: number;
  totalQuestions: number;
  questionResults: QuestionResult[];
};

function gradeFor(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

/**
 * Scores the Student's answers to the quiz on the lesson and records the
 * attempt. Returns null when the lesson has no quiz.
 */
export function submitAttempt(
  db: Db,
  userId: number,
  lessonId: number,
  answers: QuizAnswers
): AttemptResult | null {
  const quiz = getQuizForLesson(db, lessonId);
  if (!quiz) return null;
  const { questions } = quiz;

  const questionResults = questions.map((question): QuestionResult => {
    const selectedOptionId = answers[question.id] ?? null;
    const correctOptionId =
      question.options.find((o) => o.isCorrect)?.id ?? null;
    return {
      questionId: question.id,
      correct:
        selectedOptionId !== null && selectedOptionId === correctOptionId,
      selectedOptionId,
      correctOptionId,
    };
  });

  const totalCorrect = questionResults.filter((r) => r.correct).length;
  const totalQuestions = questions.length;
  const score = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
  const passed = score >= quiz.passingScore;

  const attemptId = db.transaction((tx) => {
    const attempt = tx
      .insert(quizAttempts)
      .values({ userId, quizId: quiz.id, score, passed })
      .returning()
      .get();

    for (const result of questionResults) {
      if (result.selectedOptionId === null) continue;
      tx.insert(quizAnswers)
        .values({
          attemptId: attempt.id,
          questionId: result.questionId,
          selectedOptionId: result.selectedOptionId,
        })
        .run();
    }

    return attempt.id;
  });

  return {
    attemptId,
    score,
    passed,
    grade: gradeFor(score),
    totalCorrect,
    totalQuestions,
    questionResults,
  };
}

/** The Student's highest-scoring attempt at the quiz, if they have made one. */
export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export type QuizDraft = {
  title: string;
  /** The fraction of questions a Student must get right to pass, 0 to 1. */
  passingScore: number;
  questions: Array<{
    text: string;
    type: QuestionType;
    options: Array<{ text: string; isCorrect: boolean }>;
  }>;
};

/**
 * The lesson's quiz with its questions in order and each question's options,
 * including which are correct. Null when the lesson has no quiz.
 */
export function getQuizForLesson(db: Db, lessonId: number) {
  const quiz = db
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.position))
    .all();

  const options = questions.length
    ? db
        .select()
        .from(quizOptions)
        .where(
          inArray(
            quizOptions.questionId,
            questions.map((q) => q.id)
          )
        )
        .orderBy(asc(quizOptions.id))
        .all()
    : [];

  return {
    ...quiz,
    questions: questions.map((question) => ({
      ...question,
      options: options.filter((o) => o.questionId === question.id),
    })),
  };
}

/**
 * Makes the draft the lesson's quiz, with text trimmed. Any quiz already on
 * the lesson is deleted first, along with every Student's attempts at it.
 */
export function saveQuiz(db: Db, lessonId: number, draft: QuizDraft): void {
  db.transaction((tx) => {
    deleteQuizOn(tx, lessonId);

    const quiz = tx
      .insert(quizzes)
      .values({
        lessonId,
        title: draft.title.trim(),
        passingScore: draft.passingScore,
      })
      .returning()
      .get();

    draft.questions.forEach((q, i) => {
      const question = tx
        .insert(quizQuestions)
        .values({
          quizId: quiz.id,
          questionText: q.text.trim(),
          questionType: q.type,
          position: i + 1,
        })
        .returning()
        .get();

      for (const option of q.options) {
        tx.insert(quizOptions)
          .values({
            questionId: question.id,
            optionText: option.text.trim(),
            isCorrect: option.isCorrect,
          })
          .run();
      }
    });
  });
}

/** Deletes the lesson's quiz, if any, along with every Student's attempts at it. */
export function deleteQuizForLesson(db: Db, lessonId: number): void {
  db.transaction((tx) => deleteQuizOn(tx, lessonId));
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Deletes the lesson's quiz and everything hanging off it, children first. */
function deleteQuizOn(tx: Tx, lessonId: number): void {
  const quiz = tx
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
  if (!quiz) return;

  const attemptIds = tx
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(eq(quizAttempts.quizId, quiz.id))
    .all()
    .map((a) => a.id);
  const questionIds = tx
    .select({ id: quizQuestions.id })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .all()
    .map((q) => q.id);

  if (attemptIds.length) {
    tx.delete(quizAnswers)
      .where(inArray(quizAnswers.attemptId, attemptIds))
      .run();
  }
  tx.delete(quizAttempts).where(eq(quizAttempts.quizId, quiz.id)).run();
  if (questionIds.length) {
    tx.delete(quizOptions)
      .where(inArray(quizOptions.questionId, questionIds))
      .run();
  }
  tx.delete(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).run();
  tx.delete(quizzes).where(eq(quizzes.id, quiz.id)).run();
}
