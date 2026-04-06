import mongoose, { Schema, Document } from "mongoose";

export interface ITestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  weight: number;
}

export interface IQuestion extends Document {
  type: 'MCQ' | 'CODING';
  title: string;
  content: string;
  options?: string[];
  correctAnswer?: string;
  boilerplateCode?: string;
  /** 
   * Array of verification test cases. 
   * Input should be a string: Use comma-separate for simple args (e.g. "3, 5")
   * OR use JSON for complex structures (e.g. "[1, 2, 3]").
   */
  testCases?: ITestCase[];
  driveId: mongoose.Types.ObjectId;
}

const TestCaseSchema = new Schema<ITestCase>({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
  isHidden: { type: Boolean, default: false },
  weight: { type: Number, default: 1 },
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
