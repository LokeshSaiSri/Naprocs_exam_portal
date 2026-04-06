import mongoose, { Schema, Document } from "mongoose";

export interface ITestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface IQuestion extends Document {
  type: 'MCQ' | 'CODING';
  title: string;
  content: string;
  options?: string[];
  correctAnswer?: string;
  boilerplateCode?: string;
  testCases?: ITestCase[];
  driveId: mongoose.Types.ObjectId;
}

const TestCaseSchema = new Schema<ITestCase>({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  isHidden: { type: Boolean, default: false },
});

const QuestionSchema = new Schema<IQuestion>(
  {
    driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
    type: { type: String, enum: ['MCQ', 'CODING'], required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String },
    boilerplateCode: { type: String },
    testCases: [TestCaseSchema],
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model<IQuestion>("Question", QuestionSchema);
