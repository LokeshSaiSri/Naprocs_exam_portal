import mongoose, { Schema, Document } from "mongoose";

export interface IExamSession extends Document {
  candidateId: mongoose.Types.ObjectId;
  responses: any; // Flexible JSON storage for live answers
  questionIds: mongoose.Types.ObjectId[];
  currentStage: 'MCQ' | 'CODING';
  startTime: Date;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'TERMINATED';
}

const ExamSessionSchema = new Schema<IExamSession>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    responses: { type: Schema.Types.Mixed, default: {} },
    questionIds: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    currentStage: {
       type: String,
       enum: ['MCQ', 'CODING'],
       default: 'MCQ'
    },
    startTime: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED', 'TERMINATED'],
      default: 'IN_PROGRESS',
    },
  },
  { timestamps: true }
);

export default mongoose.models.ExamSession || mongoose.model<IExamSession>("ExamSession", ExamSessionSchema);
