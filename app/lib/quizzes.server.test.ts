import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import {
  deleteQuizForLesson,
  getBestAttempt,
  getQuizForLesson,
  saveQuiz,
  submitAttempt,
  type QuizDraft,
} from "./quizzes.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

/**
 * Seeds a quiz of true/false questions on the lesson. Returns, per question,
 * the id of the correct option and of a wrong one.
 */
function seedQuiz(passingScore: number, questionCount: number) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore })
    .returning()
    .get();

  return Array.from({ length: questionCount }, (_, i) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${i + 1}`,
        questionType: QuestionType.TrueFalse,
        position: i + 1,
      })
      .returning()
      .get();
    const [right, wrong] = [true, false].map(
      (isCorrect) =>
        db
          .insert(schema.quizOptions)
          .values({
            questionId: question.id,
            optionText: isCorrect ? "True" : "False",
            isCorrect,
          })
          .returning()
          .get().id
    );
    return { questionId: question.id, right, wrong };
  });
}

/** Answers the first `correctCount` questions right and the rest wrong. */
function answer(
  questions: ReturnType<typeof seedQuiz>,
  correctCount: number
): Record<number, number> {
  return Object.fromEntries(
    questions.map((q, i) => [
      q.questionId,
      i < correctCount ? q.right : q.wrong,
    ])
  );
}

describe("submitting a quiz attempt", () => {
  it("passes a Student who scores below 70% when the quiz's pass mark is lower", () => {
    const questions = seedQuiz(0.5, 2);

    const result = submitAttempt(
      db,
      base.user.id,
      lessonId,
      answer(questions, 1)
    );

    expect(result).toMatchObject({ score: 0.5, passed: true });
  });

  it("passes a Student who scores exactly the pass mark", () => {
    const questions = seedQuiz(0.7, 10);

    const result = submitAttempt(
      db,
      base.user.id,
      lessonId,
      answer(questions, 7)
    );

    expect(result).toMatchObject({ score: 0.7, passed: true, grade: "C" });
  });

  it("fails a Student who scores above 70% when the quiz's pass mark is higher", () => {
    const questions = seedQuiz(0.9, 5);

    const result = submitAttempt(
      db,
      base.user.id,
      lessonId,
      answer(questions, 4)
    );

    expect(result).toMatchObject({ score: 0.8, passed: false, grade: "B" });
  });

  it("marks unanswered questions wrong", () => {
    const questions = seedQuiz(0.5, 2);

    const result = submitAttempt(db, base.user.id, lessonId, {
      [questions[0].questionId]: questions[0].right,
    });

    expect(result).toMatchObject({
      score: 0.5,
      totalCorrect: 1,
      totalQuestions: 2,
      questionResults: [
        {
          questionId: questions[0].questionId,
          correct: true,
          selectedOptionId: questions[0].right,
          correctOptionId: questions[0].right,
        },
        {
          questionId: questions[1].questionId,
          correct: false,
          selectedOptionId: null,
          correctOptionId: questions[1].right,
        },
      ],
    });
  });

  it("returns null when the lesson has no quiz", () => {
    expect(submitAttempt(db, base.user.id, lessonId, {})).toBeNull();
  });
});

describe("a Student's best attempt", () => {
  it("is the highest-scoring of their attempts, not the latest", () => {
    const questions = seedQuiz(0.5, 4);
    submitAttempt(db, base.user.id, lessonId, answer(questions, 1));
    submitAttempt(db, base.user.id, lessonId, answer(questions, 3));
    submitAttempt(db, base.user.id, lessonId, answer(questions, 2));
    const quizId = db.select().from(schema.quizzes).get()!.id;

    expect(getBestAttempt(db, base.user.id, quizId)).toMatchObject({
      score: 0.75,
      passed: true,
    });
  });

  it("ignores other Students' attempts", () => {
    const questions = seedQuiz(0.5, 2);
    submitAttempt(db, base.instructor.id, lessonId, answer(questions, 2));
    const quizId = db.select().from(schema.quizzes).get()!.id;

    expect(getBestAttempt(db, base.user.id, quizId)).toBeUndefined();
  });
});

const DRAFT: QuizDraft = {
  title: "  Basics check  ",
  passingScore: 0.6,
  questions: [
    {
      text: " Is SQL declarative? ",
      type: QuestionType.TrueFalse,
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    },
    {
      text: "Which is a join?",
      type: QuestionType.MultipleChoice,
      options: [
        { text: " INNER ", isCorrect: true },
        { text: "OUTSIDE", isCorrect: false },
        { text: "SIDEWAYS", isCorrect: false },
      ],
    },
  ],
};

describe("saving a quiz", () => {
  it("reads back with text trimmed and questions in the order given", () => {
    saveQuiz(db, lessonId, DRAFT);

    expect(getQuizForLesson(db, lessonId)).toMatchObject({
      title: "Basics check",
      passingScore: 0.6,
      questions: [
        {
          questionText: "Is SQL declarative?",
          questionType: QuestionType.TrueFalse,
          position: 1,
          options: [
            { optionText: "True", isCorrect: true },
            { optionText: "False", isCorrect: false },
          ],
        },
        {
          questionText: "Which is a join?",
          questionType: QuestionType.MultipleChoice,
          position: 2,
          options: [
            { optionText: "INNER", isCorrect: true },
            { optionText: "OUTSIDE", isCorrect: false },
            { optionText: "SIDEWAYS", isCorrect: false },
          ],
        },
      ],
    });
  });

  it("replaces the lesson's existing quiz, even one Students have attempted", () => {
    saveQuiz(db, lessonId, DRAFT);
    const first = getQuizForLesson(db, lessonId)!;
    submitAttempt(db, base.user.id, lessonId, {
      [first.questions[0].id]: first.questions[0].options[0].id,
    });

    saveQuiz(db, lessonId, {
      title: "Rewritten",
      passingScore: 1,
      questions: [DRAFT.questions[1]],
    });

    const quiz = getQuizForLesson(db, lessonId)!;
    expect(quiz.title).toBe("Rewritten");
    expect(quiz.questions.map((q) => q.questionText)).toEqual([
      "Which is a join?",
    ]);
  });

  it("is null for a lesson without a quiz", () => {
    expect(getQuizForLesson(db, lessonId)).toBeNull();
  });
});

describe("deleting a quiz", () => {
  it("removes the lesson's quiz, even one Students have attempted", () => {
    saveQuiz(db, lessonId, DRAFT);
    const quiz = getQuizForLesson(db, lessonId)!;
    submitAttempt(db, base.user.id, lessonId, {
      [quiz.questions[0].id]: quiz.questions[0].options[0].id,
    });

    deleteQuizForLesson(db, lessonId);

    expect(getQuizForLesson(db, lessonId)).toBeNull();
    expect(submitAttempt(db, base.user.id, lessonId, {})).toBeNull();
  });

  it("does nothing when the lesson has no quiz", () => {
    expect(() => deleteQuizForLesson(db, lessonId)).not.toThrow();
  });
});
